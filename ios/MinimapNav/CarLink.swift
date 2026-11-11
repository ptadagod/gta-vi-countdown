import AVFoundation
import Observation

/// Remembers which Bluetooth device is your car, and knows when the phone is connected to it.
/// Set up once: CarPlay is picked automatically, and the first time any other Bluetooth device
/// connects the app asks whether it's your car. After that it's recognised every time.
@MainActor @Observable
final class CarLink {
    struct Device: Identifiable, Hashable {
        let id: String   // Bluetooth address part of the port UID
        let name: String
    }

    private(set) var car: Device?
    private(set) var inCar = false
    /// Testing: act as if the car is connected.
    var pretend = false { didSet { refresh() } }
    /// Bluetooth/CarPlay devices connected right now, for picking the car.
    private(set) var available: [Device] = []
    /// A Bluetooth device that just connected while no car is set: ask once if it's the car.
    private(set) var suggestion: Device?
    /// Called when the car connects (true) or disconnects (false).
    @ObservationIgnored var onChange: ((Bool, String) -> Void)?

    @ObservationIgnored private var observer: NSObjectProtocol?
    private static let idKey = "car.bluetooth.id", nameKey = "car.bluetooth.name", declinedKey = "car.bluetooth.declined"

    init() {
        let d = UserDefaults.standard
        if let id = d.string(forKey: Self.idKey), let name = d.string(forKey: Self.nameKey) {
            car = Device(id: id, name: name)
        }
    }

    func start() {
        observer = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
        refresh()
    }

    func choose(_ device: Device) {
        car = device
        UserDefaults.standard.set(device.id, forKey: Self.idKey)
        UserDefaults.standard.set(device.name, forKey: Self.nameKey)
        refresh()
    }

    /// Answer to "Is this your car?".
    func answerSuggestion(_ yes: Bool) {
        guard let device = suggestion else { return }
        suggestion = nil
        if yes {
            choose(device)
        } else {
            var declined = UserDefaults.standard.stringArray(forKey: Self.declinedKey) ?? []
            declined.append(device.id)
            UserDefaults.standard.set(declined, forKey: Self.declinedKey)
        }
    }

    func forget() {
        car = nil
        UserDefaults.standard.removeObject(forKey: Self.idKey)
        UserDefaults.standard.removeObject(forKey: Self.nameKey)
        refresh()
    }

    /// Re-read what's connected (also used when the picker opens).
    func refresh() {
        let ports = Self.connectedPorts()
        available = ports.map(\.device)
        // One-time setup: CarPlay is always a car; any other new Bluetooth device gets asked about once.
        if car == nil {
            if let carPlay = ports.first(where: { $0.isCarPlay }) {
                choose(carPlay.device)
                return
            }
            let declined = Set(UserDefaults.standard.stringArray(forKey: Self.declinedKey) ?? [])
            if suggestion == nil, let new = available.first(where: { !declined.contains($0.id) }) {
                suggestion = new
            }
        }
        let now = pretend || (car.map { car in available.contains { $0.id == car.id || $0.name == car.name } } ?? false)
        if now != inCar {
            inCar = now
            onChange?(now, car?.name ?? "car")
        }
    }

    private static let carPorts: Set<AVAudioSession.Port> = [.bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .carAudio]

    private static func connectedPorts() -> [(device: Device, isCarPlay: Bool)] {
        let session = AVAudioSession.sharedInstance()
        var ports = session.currentRoute.outputs + session.currentRoute.inputs
        ports += session.availableInputs ?? [] // hands-free (HFP) car kits show up here
        var seen = Set<String>()
        return ports.compactMap { port in
            guard carPorts.contains(port.portType) else { return nil }
            // A2DP and hands-free UIDs share the device address before the first "-".
            let id = port.uid.split(separator: "-").first.map(String.init) ?? port.uid
            guard seen.insert(id).inserted else { return nil }
            return (Device(id: id, name: port.portName), port.portType == .carAudio)
        }
    }
}
