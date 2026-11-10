import AVFoundation
import CoreImage
import Observation
import os
import Photos
import UIKit

/// Records the camera with the minimap HUD drawn on top, plus microphone sound, then saves
/// the clip to Photos — without pausing music in other apps, like the built-in Camera app.
///
/// iOS screen recording (ReplayKit) takes over audio and stops other apps' music even with its
/// microphone off, so it isn't used. Instead the camera frames are recorded directly, a snapshot
/// of the HUD is laid over each frame, and the microphone runs in an audio session that mixes
/// with other apps.
@MainActor @Observable
final class Recorder {
    private(set) var isRecording = false
    private(set) var startedAt: Date?
    private(set) var isSaving = false

    /// The camera to record, and the on-screen HUD to draw over it.
    @ObservationIgnored var camera: CameraController?
    @ObservationIgnored private var huds: [String: WeakView] = [:]

    /// Registers an on-screen HUD piece to draw over the recording.
    func addHUD(_ view: UIView, key: String) { huds[key] = WeakView(view: view) }

    @ObservationIgnored private let mic = MicCapture()
    @ObservationIgnored private let overlay = OverlayCapture()
    @ObservationIgnored private var clip: ClipWriter?
    @ObservationIgnored private var starting = false

    func toggle(report: @escaping (String) -> Void) {
        isRecording ? stop(report: report) : start(report: report)
    }

    private func start(report: @escaping (String) -> Void) {
        let views = huds.values.compactMap(\.view)
        guard let camera, let window = views.first?.window else { return report("Recording unavailable") }
        guard !starting else { return }
        starting = true
        Task {
            defer { starting = false }
            Self.mixWithOtherAudio()
            let micAllowed = await AVCaptureDevice.requestAccess(for: .audio)

            // Same shape as the screen, 1920 pixels wide.
            let width = 1920.0
            let scale = width / window.bounds.width
            let height = (window.bounds.height * scale / 2).rounded() * 2
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("drive-\(Int(Date().timeIntervalSince1970)).mp4")
            let clip = ClipWriter(url: url, size: CGSize(width: width, height: height), withAudio: micAllowed)
            self.clip = clip

            overlay.start(views: views, scale: scale)
            if micAllowed { mic.start { clip.appendAudio($0) } }
            let latest = overlay.latest
            camera.onFrame = { clip.appendVideo($0, overlay: latest.withLock { $0 }) }

            isRecording = true
            startedAt = .now
        }
    }

    private func stop(report: @escaping (String) -> Void) {
        isRecording = false
        startedAt = nil
        isSaving = true
        camera?.onFrame = nil
        overlay.stop()
        mic.stop()
        let clip = self.clip
        self.clip = nil
        Task {
            let url = await clip?.finish()
            Self.releaseAudio()
            if let url {
                report(await Self.saveToPhotos(url) ? "Saved to Photos" : "Couldn't save · allow Photos access")
            } else {
                report("Recording failed")
            }
            isSaving = false
        }
    }

    /// Record from the microphone without interrupting music or podcasts in other apps.
    /// A2DP (not hands-free Bluetooth) keeps headphone and car audio at full quality.
    private static func mixWithOtherAudio() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default,
                                 options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
        try? session.setActive(true)
    }

    private static func releaseAudio() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func saveToPhotos(_ url: URL) async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else { return false }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }
            try? FileManager.default.removeItem(at: url)
            return true
        } catch {
            return false
        }
    }
}

struct WeakView { weak var view: UIView? }

/// Pictures of the HUD pieces and where each goes in the video frame (pixels, top-left origin).
struct Overlay: @unchecked Sendable {
    var parts: [(image: CGImage, rect: CGRect)] = []
}

/// Snapshots the HUD 30 times a second while recording.
@MainActor
final class OverlayCapture {
    let latest = OSAllocatedUnfairLock<Overlay?>(initialState: nil)
    private var link: CADisplayLink?
    private var views: [WeakView] = []
    private var scale: CGFloat = 2

    func start(views: [UIView], scale: CGFloat) {
        self.views = views.map { WeakView(view: $0) }
        self.scale = scale
        latest.withLock { $0 = nil }
        capture()
        let link = CADisplayLink(target: Tick(self), selector: #selector(Tick.fire))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 24, maximum: 30, preferred: 30)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    fileprivate func capture() {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = false
        var overlay = Overlay()
        for case let view? in views.map(\.view) {
            guard let window = view.window, view.bounds.width > 0 else { continue }
            let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
                _ = view.drawHierarchy(in: view.bounds, afterScreenUpdates: false)
            }
            guard let cg = image.cgImage else { continue }
            let frame = view.convert(view.bounds, to: window)
            overlay.parts.append((cg, CGRect(x: frame.minX * scale, y: frame.minY * scale,
                                             width: frame.width * scale, height: frame.height * scale)))
        }
        latest.withLock { $0 = overlay }
    }

    /// Display-link target that doesn't keep the capture alive.
    private final class Tick: NSObject {
        weak var owner: OverlayCapture?
        init(_ owner: OverlayCapture) { self.owner = owner }
        @objc func fire() { MainActor.assumeIsolated { owner?.capture() } }
    }
}

/// Microphone capture that uses the app's (mixable) audio session instead of configuring its own.
final class MicCapture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "mic.capture")
    private var configured = false
    private var onSample: ((CMSampleBuffer) -> Void)?

    func start(_ onSample: @escaping (CMSampleBuffer) -> Void) {
        queue.async { [self] in
            self.onSample = onSample
            if !configured {
                configured = true
                session.automaticallyConfiguresApplicationAudioSession = false
                session.usesApplicationAudioSession = true
                session.beginConfiguration()
                if let device = AVCaptureDevice.default(for: .audio),
                   let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
                    session.addInput(input)
                }
                let output = AVCaptureAudioDataOutput()
                output.setSampleBufferDelegate(self, queue: queue)
                if session.canAddOutput(output) { session.addOutput(output) }
                session.commitConfiguration()
            }
            if !session.isRunning { session.startRunning() }
        }
    }

    func stop() {
        queue.async { [self] in
            if session.isRunning { session.stopRunning() }
            onSample = nil
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        onSample?(sampleBuffer)
    }
}

/// Writes camera frames (cropped to the screen's shape, HUD on top) and microphone audio into one .mp4.
final class ClipWriter: @unchecked Sendable {
    private let url: URL
    private let size: CGSize
    private let withAudio: Bool
    private let queue = DispatchQueue(label: "clip.writer")
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private var writer: AVAssetWriter?
    private var video: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var audio: AVAssetWriterInput?
    private var startTime: CMTime?
    private var done = false

    init(url: URL, size: CGSize, withAudio: Bool) {
        self.url = url
        self.size = size
        self.withAudio = withAudio
    }

    func appendVideo(_ buffer: CMSampleBuffer, overlay: Overlay?) {
        queue.async { [self] in
            guard !done else { return }
            let time = CMSampleBufferGetPresentationTimeStamp(buffer)
            if startTime == nil, !begin(at: time) { return }
            guard let video, video.isReadyForMoreMediaData, let adaptor, let pool = adaptor.pixelBufferPool,
                  let camera = CMSampleBufferGetImageBuffer(buffer) else { return }
            var out: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out)
            guard let out else { return }
            context.render(compose(camera, overlay), to: out, bounds: CGRect(origin: .zero, size: size), colorSpace: colorSpace)
            adaptor.append(out, withPresentationTime: time)
        }
    }

    func appendAudio(_ buffer: CMSampleBuffer) {
        queue.async { [self] in
            guard !done, let start = startTime, let audio, audio.isReadyForMoreMediaData,
                  CMSampleBufferGetPresentationTimeStamp(buffer) >= start else { return }
            audio.append(buffer)
        }
    }

    /// Finishes the file; returns its URL, or nil if nothing usable was written.
    func finish() async -> URL? {
        await withCheckedContinuation { (cont: CheckedContinuation<URL?, Never>) in
            queue.async { [self] in
                done = true
                guard let writer, writer.status == .writing else { return cont.resume(returning: nil) }
                video?.markAsFinished()
                audio?.markAsFinished()
                writer.finishWriting { [url] in
                    cont.resume(returning: writer.status == .completed ? url : nil)
                }
            }
        }
    }

    /// Fill the frame with the camera picture the way the on-screen preview does, then lay the HUD over it.
    private func compose(_ camera: CVPixelBuffer, _ overlay: Overlay?) -> CIImage {
        var image = CIImage(cvPixelBuffer: camera)
        let e = image.extent
        let s = max(size.width / e.width, size.height / e.height)
        image = image.transformed(by: CGAffineTransform(scaleX: s, y: s))
        let f = image.extent
        image = image.transformed(by: CGAffineTransform(translationX: (size.width - f.width) / 2 - f.minX,
                                                        y: (size.height - f.height) / 2 - f.minY))
        for part in overlay?.parts ?? [] {
            let hud = CIImage(cgImage: part.image)
            let sx = part.rect.width / hud.extent.width, sy = part.rect.height / hud.extent.height
            let placed = hud
                .transformed(by: CGAffineTransform(scaleX: sx, y: sy))
                .transformed(by: CGAffineTransform(translationX: part.rect.minX, y: size.height - part.rect.maxY))
            image = placed.composited(over: image)
        }
        return image.cropped(to: CGRect(origin: .zero, size: size))
    }

    private func begin(at time: CMTime) -> Bool {
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return false }
        let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 12_000_000,
                AVVideoExpectedSourceFrameRateKey: 30,
            ],
        ])
        video.expectsMediaDataInRealTime = true
        guard writer.canAdd(video) else { return false }
        writer.add(video)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height),
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        ])

        if withAudio {
            let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVNumberOfChannelsKey: 1,
                AVSampleRateKey: 44_100,
                AVEncoderBitRateKey: 128_000,
            ])
            audio.expectsMediaDataInRealTime = true
            if writer.canAdd(audio) {
                writer.add(audio)
                self.audio = audio
            }
        }

        guard writer.startWriting() else { return false }
        writer.startSession(atSourceTime: time)
        self.writer = writer
        self.video = video
        self.adaptor = adaptor
        startTime = time
        return true
    }
}
