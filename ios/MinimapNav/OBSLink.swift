import CoreLocation
import Foundation
import Observation

/// Sends your GPS to your OBS overlay's room on the relay, so the stream minimap follows you,
/// even with the phone locked or another app open (location keeps the app running).
///
/// The relay keeps one shared state per room (stars, money, route…). The app keeps the latest
/// copy it received, puts your position into `nav.live`, and sends the whole thing back, so
/// whatever the OBS dock set stays as it is.
@MainActor @Observable
final class OBSLink {
    static let relay = "wss://hud-overlay-relay.peter-pitasamioto.workers.dev"

    /// Your private room code (the `room=` part of your OBS links).
    var room: String {
        didSet {
            let clean = Self.code(from: room)
            if clean != room { room = clean; return }
            UserDefaults.standard.set(room, forKey: "obsRoom")
            reconnect()
        }
    }
    /// Sending on or off.
    var sending: Bool {
        didSet {
            UserDefaults.standard.set(sending, forKey: "obsSending")
            onSendingChange?(sending)
            reconnect()
        }
    }
    private(set) var status = "Off"
    var onSendingChange: ((Bool) -> Void)?

    @ObservationIgnored private var socket: URLSessionWebSocketTask?
    @ObservationIgnored private var latest: [String: Any] = [:]
    @ObservationIgnored private var lastSent = Date.distantPast
    @ObservationIgnored private var retry: Double = 1
    @ObservationIgnored private let me = "phone-" + UUID().uuidString.prefix(8).lowercased()

    init() {
        room = UserDefaults.standard.string(forKey: "obsRoom") ?? ""
        sending = UserDefaults.standard.bool(forKey: "obsSending")
    }

    /// Accepts a bare code or a whole OBS link with `?room=…`.
    static func code(from text: String) -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let r = t.range(of: "room=") {
            return String(t[r.upperBound...].prefix { $0.isLetter || $0.isNumber })
        }
        return String(t.filter { $0.isLetter || $0.isNumber }.prefix(32))
    }

    var valid: Bool { room.count >= 8 && room.count <= 32 }

    func start() { reconnect() }

    private func reconnect() {
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        guard sending else { status = "Off"; return }
        guard valid, let url = URL(string: "\(Self.relay)/room/\(room)") else { status = "Enter your room code"; return }
        status = "Connecting…"
        let task = URLSession.shared.webSocketTask(with: url)
        socket = task
        task.resume()
        receive(task)
    }

    private func receive(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            Task { @MainActor in
                guard let self, self.socket === task else { return }
                switch result {
                case .success(let message):
                    self.retry = 1
                    if self.status != "Live" && !self.status.hasPrefix("Sending") { self.status = "Live" }
                    if case .string(let text) = message,
                       let data = text.data(using: .utf8),
                       let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       msg["type"] as? String == "state",
                       let state = msg["state"] as? [String: Any] {
                        self.latest = state
                    }
                    self.receive(task)
                case .failure:
                    self.status = "Reconnecting…"
                    let wait = self.retry
                    self.retry = min(self.retry * 2, 15)
                    try? await Task.sleep(for: .seconds(wait))
                    if self.socket === task { self.reconnect() }
                }
            }
        }
    }

    /// Call on every GPS fix; sends at most once a second.
    func send(_ fix: CLLocation, heading: Double) {
        guard sending, let socket, Date.now.timeIntervalSince(lastSent) >= 1 else { return }
        lastSent = .now
        var state = latest
        var nav = state["nav"] as? [String: Any] ?? [:]
        let speed = max(0, fix.speed)
        nav["live"] = [
            "on": true,
            "pos": [round(fix.coordinate.longitude * 1e6) / 1e6, round(fix.coordinate.latitude * 1e6) / 1e6],
            "heading": heading,
            "speed": speed,
            "acc": Int(fix.horizontalAccuracy.rounded()),
            "at": Int(Date.now.timeIntervalSince1970 * 1000),
        ] as [String: Any]
        if var drive = nav["drive"] as? [String: Any] { drive["on"] = false; nav["drive"] = drive }
        state["nav"] = nav
        latest = state
        let msg: [String: Any] = ["type": "state", "from": me, "state": state]
        guard let data = try? JSONSerialization.data(withJSONObject: msg),
              let text = String(data: data, encoding: .utf8) else { return }
        socket.send(.string(text)) { _ in }
        status = "Sending · ±\(Int(fix.horizontalAccuracy.rounded())) m · \(Int((speed * 3.6).rounded())) km/h"
    }
}
