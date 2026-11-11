import AVFoundation
import os
import SwiftUI
import UIKit

/// Runs the back camera for the full-screen preview behind the HUD.
/// Session work happens on its own serial queue. Frames are also handed to `onFrame`
/// (upright, landscape) while recording.
final class CameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private(set) var device: AVCaptureDevice?
    private let queue = DispatchQueue(label: "camera.session")
    private let frameQueue = DispatchQueue(label: "camera.frames")
    private let videoOutput = AVCaptureVideoDataOutput()
    private var rotation: AVCaptureDevice.RotationCoordinator?
    private var rotationObservation: NSKeyValueObservation?
    private var configured = false
    private var pressureObservation: NSKeyValueObservation?
    private var observers: [NSObjectProtocol] = []
    // A plain lock and concrete closure type: storing the closure in a generic lock re-wrapped
    // it on every frame until the stack overflowed after a few minutes.
    private let frameLock = NSLock()
    private var frameHandler: (@Sendable (CMSampleBuffer) -> Void)?

    /// Receives every camera frame on a background queue; nil when not recording.
    var onFrame: (@Sendable (CMSampleBuffer) -> Void)? {
        get { frameLock.lock(); defer { frameLock.unlock() }; return frameHandler }
        set { frameLock.lock(); frameHandler = newValue; frameLock.unlock() }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        onFrame?(sampleBuffer)
    }

    func start(onReady: @escaping @MainActor () -> Void, onUnavailable: @escaping @MainActor (String) -> Void) {
        Task {
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                await onUnavailable("Camera access is off · enable it in Settings")
                return
            }
            queue.async { [self] in
                if !configured { configure() }
                if device == nil {
                    Task { await onUnavailable("No camera on this device") }
                    return
                }
                if !session.isRunning { session.startRunning() }
                Task { await onReady() }
            }
        }
    }

    func stop() {
        queue.async { [self] in if session.isRunning { session.stopRunning() } }
    }

    private func configure() {
        configured = true
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .high
        session.automaticallyConfiguresApplicationAudioSession = false // never interrupt other apps' audio
        guard let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: cam),
              session.canAddInput(input) else { return }
        session.addInput(input)
        device = cam

        videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(self, queue: frameQueue)
        guard session.canAddOutput(videoOutput) else { return }
        session.addOutput(videoOutput)

        watchHealth(cam)

        // Keep recorded frames level with the horizon whichever way the phone is turned.
        let coordinator = AVCaptureDevice.RotationCoordinator(device: cam, previewLayer: nil)
        rotation = coordinator
        applyCaptureRotation(coordinator.videoRotationAngleForHorizonLevelCapture)
        rotationObservation = coordinator.observe(\.videoRotationAngleForHorizonLevelCapture, options: [.new]) { [weak self] c, _ in
            let angle = c.videoRotationAngleForHorizonLevelCapture
            self?.queue.async { self?.applyCaptureRotation(angle) }
        }
    }

    /// Keep the camera alive on a long drive: restart after errors or interruptions, and when the
    /// phone heats up drop to a lower frame rate rather than letting iOS shut the camera off.
    private func watchHealth(_ cam: AVCaptureDevice) {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil) { [weak self] note in
            let error = note.userInfo?[AVCaptureSessionErrorKey] as? NSError
            DriveLog.write("camera runtime error \(error?.code ?? 0) \(error?.localizedDescription ?? "")")
            self?.queue.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self, !self.session.isRunning else { return }
                self.session.startRunning()
                DriveLog.write("camera restarted, running=\(self.session.isRunning)")
            }
        })
        observers.append(center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil) { note in
            let reason = (note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? NSNumber)?.intValue ?? -1
            DriveLog.write("camera interrupted, reason \(reason)")
        })
        observers.append(center.addObserver(forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: nil) { [weak self] _ in
            DriveLog.write("camera interruption ended")
            self?.queue.async { [weak self] in
                guard let self, !self.session.isRunning else { return }
                self.session.startRunning()
            }
        })
        pressureObservation = cam.observe(\.systemPressureState, options: [.new]) { [weak self] device, _ in
            let level = device.systemPressureState.level
            DriveLog.write("camera system pressure \(level.rawValue)")
            self?.queue.async { [weak self] in self?.setFrameRate(for: level, on: device) }
        }
    }

    private func setFrameRate(for level: AVCaptureDevice.SystemPressureState.Level, on device: AVCaptureDevice) {
        let fps: Int32 = switch level {
        case .serious: 24
        case .critical, .shutdown: 15
        default: 30
        }
        guard (try? device.lockForConfiguration()) != nil else { return }
        let duration = CMTime(value: 1, timescale: fps)
        if device.activeFormat.videoSupportedFrameRateRanges.contains(where: { $0.minFrameRate <= Double(fps) }) {
            device.activeVideoMinFrameDuration = duration
            device.activeVideoMaxFrameDuration = duration
        }
        device.unlockForConfiguration()
    }

    private func applyCaptureRotation(_ angle: CGFloat) {
        if let conn = videoOutput.connection(with: .video), conn.isVideoRotationAngleSupported(angle) {
            conn.videoRotationAngle = angle
        }
    }
}

final class CameraPreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    private var rotation: AVCaptureDevice.RotationCoordinator?
    private var observation: NSKeyValueObservation?

    /// Keep the preview upright as the phone rotates.
    func follow(_ device: AVCaptureDevice?) {
        guard rotation == nil, let device else { return }
        let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: previewLayer)
        rotation = coordinator
        apply(coordinator.videoRotationAngleForHorizonLevelPreview)
        observation = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.new]) { [weak self] c, _ in
            let angle = c.videoRotationAngleForHorizonLevelPreview
            DispatchQueue.main.async { self?.apply(angle) }
        }
    }

    private func apply(_ angle: CGFloat) {
        if let conn = previewLayer.connection, conn.isVideoRotationAngleSupported(angle) {
            conn.videoRotationAngle = angle
        }
    }
}

struct CameraPreview: UIViewRepresentable {
    let camera: CameraController
    /// Changes once the session is running, so the preview can attach rotation handling.
    let ready: Bool

    func makeUIView(context: Context) -> CameraPreviewView {
        let v = CameraPreviewView()
        v.backgroundColor = .black
        v.previewLayer.session = camera.session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ v: CameraPreviewView, context: Context) {
        if ready { v.follow(camera.device) }
    }
}
