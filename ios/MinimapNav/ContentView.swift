import SwiftUI

@main
struct MinimapNavApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}

struct ContentView: View {
    @State private var nav = Navigator()
    @State private var recorder = Recorder()
    @State private var camera = CameraController()
    @State private var cameraMessage: String?
    @State private var cameraReady = false
    @State private var showSearch = false
    @State private var wanted = WantedLevel()
    private let hudInset: CGFloat = 24

    var body: some View {
        GeometryReader { geo in
            let mapWidth = min(geo.size.width * 0.24, 250)

            ZStack {
                CameraPreview(camera: camera, ready: cameraReady)
                    .ignoresSafeArea()
                    .overlay {
                        if let cameraMessage {
                            ZStack {
                                LinearGradient(colors: [Color(white: 0.16), Color(white: 0.05)], startPoint: .top, endPoint: .bottom)
                                Text(cameraMessage).font(.footnote).foregroundStyle(.secondary)
                            }
                            .ignoresSafeArea()
                        }
                    }

                // Health bar, top left, lined up with the minimap below.
                VStack {
                    HStack {
                        HUDHost(onView: { recorder.addHUD($0, key: "health") }) {
                            HealthBar()
                                .frame(width: mapWidth + 8)
                                .padding(hudInset)
                        }
                        .frame(width: mapWidth + 8 + hudInset * 2, height: HealthBar.height + hudInset * 2)
                        .padding(-hudInset)
                        Spacer()
                        HUDHost(onView: { recorder.addHUD($0, key: "wanted") }) {
                            WantedStars(wanted: wanted)
                                .padding(hudInset)
                        }
                        .frame(width: WantedStars.width + hudInset * 2, height: WantedStars.size + hudInset * 2)
                        .padding(-hudInset)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)

                VStack {
                    if let toast = nav.toast, !recorder.isRecording {
                        Toast(text: toast).transition(.opacity.combined(with: .move(edge: .top)))
                    }
                    Spacer()
                }
                .padding(.top, 8)
                .animation(.easeOut(duration: 0.25), value: nav.toast)

                VStack {
                    Spacer()
                    HStack(alignment: .bottom) {
                        // Hosted separately so the recorder can snapshot exactly the HUD over each camera frame.
                        HUDHost(onView: { recorder.addHUD($0, key: "minimap") }) {
                            VStack(alignment: .leading, spacing: 8) {
                                DirectionBox(nav: nav)
                                    .frame(width: mapWidth + 8)
                                MinimapView(navigator: nav)
                                    .frame(width: mapWidth, height: mapWidth * 2 / 3)
                                    .overlay { PoliceFlash(wanted: wanted) }
                                    .padding(4)
                                    .background(.black.opacity(0.3), in: .rect(cornerRadius: 20, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(.white.opacity(0.14)))
                                    .shadow(color: .black.opacity(0.45), radius: 14, y: 6)
                                    .contentShape(Rectangle())
                                    .onTapGesture { showSearch = true }
                                    .accessibilityLabel("Minimap")
                                    .accessibilityHint("Opens waypoint search")
                            }
                            .animation(.easeOut(duration: 0.25), value: nav.upcoming)
                            .animation(.easeOut(duration: 0.25), value: nav.rerouting)
                            .padding(hudInset)
                            .frame(width: mapWidth + 8 + hudInset * 2,
                                   height: mapWidth * 2 / 3 + 8 + 8 + 62 + hudInset * 2,
                                   alignment: .bottomLeading)
                        }
                        .frame(width: mapWidth + 8 + hudInset * 2,
                               height: mapWidth * 2 / 3 + 8 + 8 + 62 + hudInset * 2)
                        .padding(-hudInset)
                        Spacer()
                        if !recorder.isRecording {
                            RecordButton(recorder: recorder) { nav.show($0) }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 14)

                // While recording only the camera and minimap are on screen: tap anywhere to stop.
                if recorder.isRecording {
                    Color.clear
                        .contentShape(Rectangle())
                        .ignoresSafeArea()
                        .onTapGesture { recorder.toggle { nav.show($0) } }
                        .accessibilityLabel("Stop recording")
                        .accessibilityAddTraits(.isButton)
                }
            }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .sheet(isPresented: $showSearch) {
            SearchSheet(nav: nav)
                .presentationDetents([.medium, .large])
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            UIDevice.current.beginGeneratingDeviceOrientationNotifications()
            nav.start()
            recorder.camera = camera
            camera.start(onReady: { cameraReady = true }, onUnavailable: { cameraMessage = $0 })
            Task {
                try? await Task.sleep(for: .seconds(2.8))
                if nav.destination == nil { nav.show("Tap the map to set a waypoint") }
            }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                wanted.tick(position: nav.position, speed: nav.speed, dt: 1)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)) { _ in
            nav.setHeadingOrientation(UIDevice.current.orientation)
        }
    }
}

/// Hosts SwiftUI content in its own transparent UIKit view, handed to `onView`.
private struct HUDHost<Content: View>: UIViewControllerRepresentable {
    let onView: (UIView) -> Void
    @ViewBuilder let content: () -> Content

    func makeUIViewController(context: Context) -> UIHostingController<Content> {
        let host = UIHostingController(rootView: content())
        host.view.backgroundColor = .clear
        host.overrideUserInterfaceStyle = .dark
        host.safeAreaRegions = [] // the outer layout already handles the notch
        onView(host.view)
        return host
    }

    func updateUIViewController(_ host: UIHostingController<Content>, context: Context) {
        host.rootView = content()
    }
}

/// Health bar that tracks the phone's battery: green when full, amber below half,
/// red and pulsing below 20%.
private struct HealthBar: View {
    static let height: CGFloat = 12
    @State private var level = Self.read()
    @State private var pulse = false

    var body: some View {
        let low = level < 0.2
        let color: Color = low ? Color(red: 0.86, green: 0.16, blue: 0.16)
            : level < 0.5 ? Color(red: 0.93, green: 0.66, blue: 0.14)
            : Color(red: 0.36, green: 0.73, blue: 0.29)
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Rectangle().fill(color.opacity(0.28))
                Rectangle().fill(color)
                    .frame(width: max(0, (g.size.width - 4) * level))
                    .padding(2)
                    .opacity(low && pulse ? 0.35 : 1)
            }
        }
        .frame(height: Self.height)
        .background(.black.opacity(0.55))
        .overlay(Rectangle().stroke(.black.opacity(0.6), lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
        .animation(.easeOut(duration: 0.6), value: level)
        .onAppear {
            UIDevice.current.isBatteryMonitoringEnabled = true
            level = Self.read()
            withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) { pulse = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIDevice.batteryLevelDidChangeNotification)) { _ in
            level = Self.read()
        }
        .accessibilityElement()
        .accessibilityLabel("Health")
        .accessibilityValue("\(Int(level * 100)) percent")
    }

    private static func read() -> Double {
        let l = UIDevice.current.batteryLevel
        return l < 0 ? 1 : Double(l) // unknown (e.g. simulator) shows full
    }
}

/// Six wanted stars, top right. Lit stars fill from the right; they blink quickly when the
/// level goes up and slowly while it's about to drop.
private struct WantedStars: View {
    static let size: CGFloat = 22
    static let spacing: CGFloat = 3
    static var width: CGFloat { size * CGFloat(WantedLevel.maxStars) + spacing * CGFloat(WantedLevel.maxStars - 1) }
    let wanted: WantedLevel

    var body: some View {
        // Only shown while wanted.
        ZStack {
            if wanted.stars > 0 { stars }
        }
        .frame(width: Self.width, height: Self.size)
        .animation(.easeOut(duration: 0.3), value: wanted.stars > 0)
    }

    private var stars: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { t in
            let phase = t.date.timeIntervalSinceReferenceDate
            let blinkOff = wanted.justRaised ? Int(phase * 6) % 2 == 0
                : wanted.evading ? Int(phase * 2) % 2 == 0 : false
            HStack(spacing: Self.spacing) {
                ForEach(0..<WantedLevel.maxStars, id: \.self) { i in
                    let lit = i >= WantedLevel.maxStars - wanted.stars
                    Image(systemName: "star.fill")
                        .font(.system(size: Self.size - 2, weight: .black))
                        .foregroundStyle(lit && !blinkOff ? Color.white : Color(white: 0.16))
                        .overlay(Image(systemName: "star").font(.system(size: Self.size - 2, weight: .black))
                            .foregroundStyle(.black))
                        .frame(width: Self.size, height: Self.size)
                }
            }
            .shadow(color: .black.opacity(0.5), radius: 3, y: 1)
        }
        .transition(.opacity)
        .accessibilityElement()
        .accessibilityLabel("Wanted level")
        .accessibilityValue("\(wanted.stars) of \(WantedLevel.maxStars) stars")
    }
}

/// Red and blue police lights washing over the minimap while you're wanted; brighter and
/// faster with more stars.
private struct PoliceFlash: View {
    let wanted: WantedLevel

    var body: some View {
        if wanted.stars > 0 { lights(stars: wanted.stars) }
    }

    private func lights(stars: Int) -> some View {
        TimelineView(.animation) { t in
            // Smooth crossfade red → blue → red, one full cycle every 2.4 s.
            let phase = t.date.timeIntervalSinceReferenceDate * 2 * .pi / 2.4
            let redWeight = (1 + sin(phase)) / 2
            let strength = 0.24 + Double(stars) * 0.03
            ZStack {
                glow(Color(red: 1, green: 0.1, blue: 0.15), from: .leading, strength: strength)
                    .opacity(redWeight)
                glow(Color(red: 0.1, green: 0.35, blue: 1), from: .trailing, strength: strength)
                    .opacity(1 - redWeight)
            }
        }
        .allowsHitTesting(false)
        .transition(.opacity)
        .accessibilityHidden(true)
    }
}

private func glow(_ color: Color, from side: UnitPoint, strength: Double) -> some View {
    RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(RadialGradient(colors: [color.opacity(strength * 0.5), color.opacity(strength * 1.6)],
                             center: side, startRadius: 10, endRadius: 260))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(color.opacity(0.8), lineWidth: 2.5))
}

/// The next turn, shown in a box above the minimap.
private struct DirectionBox: View {
    let nav: Navigator

    var body: some View {
        if nav.rerouting {
            row(symbol: "arrow.triangle.2.circlepath", distance: nil, text: "Recalculating")
                .transition(.opacity)
        } else if let next = nav.upcoming {
            row(symbol: next.symbol, distance: next.distance, text: next.text)
                .id(next.text) // fade between instructions rather than morphing
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }

    private func row(symbol: String, distance: String?, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color(MinimapHUDView.pink))
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 0) {
                if let distance {
                    Text(distance)
                        .font(.system(size: 20, weight: .heavy).width(.condensed).monospacedDigit())
                        .foregroundStyle(.white)
                }
                Text(text)
                    .font(.system(size: 13, weight: .semibold).width(.condensed))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 54)
        .background(.black.opacity(0.55), in: .rect(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(.white.opacity(0.14)))
        .shadow(color: .black.opacity(0.35), radius: 8, y: 3)
        .accessibilityElement(children: .combine)
    }
}

private struct Toast: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 15, weight: .heavy).width(.condensed))
            .tracking(0.8)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(.black.opacity(0.6), in: Capsule())
    }
}

private struct RecordButton: View {
    let recorder: Recorder
    let report: (String) -> Void

    var body: some View {
        VStack(spacing: 6) {
            Button {
                if !recorder.isRecording { report("Tap anywhere to stop recording") }
                recorder.toggle(report: report)
            } label: {
                ZStack {
                    Circle().stroke(.white.opacity(0.9), lineWidth: 3).frame(width: 58, height: 58)
                    RoundedRectangle(cornerRadius: recorder.isRecording ? 6 : 23, style: .continuous)
                        .fill(.red)
                        .frame(width: recorder.isRecording ? 24 : 46, height: recorder.isRecording ? 24 : 46)
                }
                .animation(.spring(duration: 0.3), value: recorder.isRecording)
                .shadow(color: .black.opacity(0.4), radius: 6)
            }
            .disabled(recorder.isSaving)
            .opacity(recorder.isSaving ? 0.5 : 1)
            .accessibilityLabel(recorder.isRecording ? "Stop recording" : "Start recording")
        }
    }
}

struct SearchSheet: View {
    @Bindable var nav: Navigator
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Place] = []
    @State private var failed = false

    var body: some View {
        NavigationStack {
            List {
                if query.isEmpty, !nav.routes.isEmpty {
                    Section("Routes") {
                        ForEach(nav.routes.indices, id: \.self) { i in
                            let r = nav.routes[i]
                            Button {
                                nav.selectRoute(i)
                                dismiss()
                            } label: {
                                HStack {
                                    Circle().fill(Color(MinimapHUDView.pink).opacity(i == nav.active ? 1 : 0.4)).frame(width: 10, height: 10)
                                    Text("Route \(i + 1)")
                                    Spacer()
                                    Text("\(MinimapHUDView.format(r.distance)) · \(Int((r.duration / 60).rounded())) min")
                                        .foregroundStyle(.secondary)
                                    if i == nav.active { Image(systemName: "checkmark").foregroundStyle(Color(MinimapHUDView.pink)) }
                                }
                            }
                            .tint(.primary)
                        }
                    }
                    Section {
                        Button(nav.simulating ? "Stop demo drive" : "Demo drive along route") {
                            nav.toggleSimulation()
                            dismiss()
                        }
                        Picker("Demo speed", selection: $nav.simMultiplier) {
                            ForEach([1.0, 2, 4, 8], id: \.self) { Text("×\(Int($0))").tag($0) }
                        }
                        .pickerStyle(.segmented)
                        Button("Clear waypoint", role: .destructive) {
                            nav.clearDestination("Waypoint cleared")
                            dismiss()
                        }
                    }
                }
                if !results.isEmpty {
                    Section("Places") {
                        ForEach(results) { place in
                            Button {
                                nav.setDestination(place)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(place.title).foregroundStyle(.primary)
                                    Text(place.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                        }
                    }
                } else if failed {
                    Text("Search unavailable").foregroundStyle(.secondary)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Set waypoint")
            .navigationTitle(nav.destination?.title ?? "Set waypoint")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: query) {
                let q = query.trimmingCharacters(in: .whitespaces)
                guard q.count >= 2 else { results = []; return }
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled else { return }
                do {
                    results = try await Services.search(q, near: nav.position)
                    failed = false
                } catch {
                    if !Task.isCancelled { failed = true }
                }
            }
        }
    }
}
