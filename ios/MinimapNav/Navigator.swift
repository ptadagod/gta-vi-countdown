import CoreLocation
import CoreMotion
import simd
import Observation
import UIKit

/// Owns the player's position (GPS or demo drive), the destination and routes, and
/// progress along the active route: remaining distance, rerouting and arrival.
@MainActor @Observable
final class Navigator: NSObject {
    static let fallback = Coord(latitude: -36.8485, longitude: 174.7633) // Auckland, if GPS never arrives

    // Player
    private(set) var position: Coord?
    private(set) var heading: Double = 0 // degrees clockwise from north
    private(set) var speed: Double = 0 // m/s
    private(set) var hasGPS = false

    // Route
    private(set) var destination: Place?
    private(set) var routes: [RouteOption] = []
    private(set) var active = 0
    private(set) var along: Double = 0
    private(set) var remaining: Double?
    private(set) var isRouting = false
    /// Bumped whenever the drawn route should change.
    private(set) var routeRevision = 0
    /// Set when a new route arrives, so the HUD can pull back briefly.
    private(set) var routeArrivedAt: Date?
    /// The next turn instruction, for the direction box.
    private(set) var upcoming: Upcoming?
    /// True while fetching a new route after leaving the old one.
    private(set) var rerouting = false

    struct Upcoming: Equatable {
        let text: String
        let symbol: String
        let distance: String
    }

    // Demo drive (also how the app is tested without moving)
    private(set) var simulating = false
    var simMultiplier: Double = 1

    // Messages shown briefly over the camera
    private(set) var toast: String?
    private var toastTask: Task<Void, Never>?

    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var lastFix: CLLocation?
    @ObservationIgnored private var compass: Double?
    @ObservationIgnored private let motion = CMMotionManager()
    @ObservationIgnored private var declination: Double = 0 // true north minus magnetic north
    @ObservationIgnored private var lastCameraHeading = Date.distantPast
    /// Device-frame vector for "up the screen" in the current landscape orientation,
    /// used when the phone is held flat and the camera points at the ground.
    @ObservationIgnored private var screenUp = simd_double3(1, 0, 0)

    /// Above this speed (m/s, ~14 km/h) GPS course steers the map; below it, where the camera points.
    /// In the car (its Bluetooth is connected) the phone is mounted facing forward, so trust
    /// the GPS direction of travel from walking pace up rather than only above 4 m/s.
    var inCar = false
    private var courseSpeed: Double { inCar ? 2 : 4 }
    @ObservationIgnored private var offSince: Date?
    @ObservationIgnored private var lastRouteAt = Date.distantPast
    @ObservationIgnored private var routeTask: Task<Void, Never>?
    @ObservationIgnored private var simDistance: Double = 0
    @ObservationIgnored private var lastProgress = Date.distantPast

    var activeRoute: RouteOption? { routes.indices.contains(active) ? routes[active] : nil }

    func start() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.activityType = .automotiveNavigation
        manager.headingFilter = 2
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
        setHeadingOrientation(UIDevice.current.orientation)
        startCameraHeading()
        Task {
            try? await Task.sleep(for: .seconds(6))
            if position == nil {
                position = Self.fallback
                show("No GPS · starting in Auckland")
            }
        }
    }

    func setHeadingOrientation(_ o: UIDeviceOrientation) {
        // The app is landscape-only, so ignore the phone passing through portrait.
        switch o {
        case .landscapeRight:
            manager.headingOrientation = .landscapeRight
            screenUp = simd_double3(-1, 0, 0)
        default: // landscapeLeft, and the launch default
            manager.headingOrientation = .landscapeLeft
            screenUp = simd_double3(1, 0, 0)
        }
    }

    // MARK: Destination and routes

    func setDestination(_ place: Place) {
        destination = place
        routes = []
        remaining = nil
        routeRevision += 1
        requestRoute(announce: true)
    }

    func clearDestination(_ message: String? = nil) {
        routeTask?.cancel()
        destination = nil
        routes = []
        remaining = nil
        upcoming = nil
        isRouting = false
        rerouting = false
        simulating = false
        routeRevision += 1
        if let message { show(message) }
    }

    func selectRoute(_ i: Int) {
        guard routes.indices.contains(i), let p = position else { return }
        active = i
        along = routes[i].track.snap(p).along
        simDistance = along
        remaining = routes[i].track.length - along
        routeRevision += 1
        updateUpcoming(routes[i])
    }

    private func requestRoute(announce: Bool) {
        guard let dest = destination else { return }
        let from = position ?? Self.fallback
        let travelling = speed > 3 ? heading : nil
        routeTask?.cancel()
        isRouting = true
        rerouting = !announce
        lastRouteAt = .now
        routeTask = Task {
            defer { if !Task.isCancelled { isRouting = false; rerouting = false } }
            do {
                let found = try await Services.routes(from: from, to: dest.coord, heading: travelling)
                guard !Task.isCancelled else { return }
                routes = found
                active = 0
                along = 0
                simDistance = 0
                offSince = nil
                remaining = found[0].track.length
                routeRevision += 1
                if announce { routeArrivedAt = .now }
                updateProgress()
                if announce, found.count > 1 { show("\(found.count) routes · tap the map to switch") }
            } catch is CancellationError {
            } catch {
                if !Task.isCancelled { show(error.localizedDescription) }
            }
        }
    }

    // MARK: Demo drive

    func toggleSimulation() {
        guard let r = activeRoute else { return show("Set a waypoint first") }
        simulating.toggle()
        if simulating {
            simDistance = position.map { r.track.snap($0).along } ?? 0
        } else {
            speed = 0
        }
    }

    /// Called every display frame by the HUD.
    func step(_ dt: Double) {
        if simulating, let r = activeRoute {
            let cruise = min(25, max(8, r.distance / max(r.duration, 1)))
            speed = cruise * simMultiplier
            simDistance = min(r.track.length, simDistance + speed * dt)
            let p = r.track.point(at: simDistance)
            let ahead = r.track.point(at: simDistance + 18)
            if Geo.distance(p, ahead) > 2 { heading = Geo.bearing(p, ahead) }
            position = p
        }
        if Date.now.timeIntervalSince(lastProgress) > 0.15 {
            lastProgress = .now
            updateProgress()
        }
    }

    private func updateProgress() {
        guard let r = activeRoute, let p = position else { return }
        let offset: Double
        if simulating {
            along = simDistance
            offset = 0
        } else {
            let snap = r.track.snap(p)
            along = snap.along
            offset = snap.offset
        }
        let left = r.track.length - along
        if left < 22, offset < 40 {
            return clearDestination("Waypoint reached")
        }
        remaining = left + offset
        routeRevision += 1
        updateUpcoming(r)
        // Off course: more than ~35 m from the route for 2 s → fetch a new route from here.
        if offset > max(35, lastFix?.horizontalAccuracy ?? 0) {
            if offSince == nil { offSince = .now }
            if let since = offSince, Date.now.timeIntervalSince(since) > 2, !isRouting,
               Date.now.timeIntervalSince(lastRouteAt) > 5 {
                show("Recalculating")
                requestRoute(announce: false)
            }
        } else {
            offSince = nil
        }
    }

    private func updateUpcoming(_ r: RouteOption) {
        let next = r.maneuvers.first { $0.along > along + 3 }
        let value = next.map {
            Upcoming(text: $0.text, symbol: $0.symbol, distance: MinimapHUDView.format($0.along - along))
        }
        if value != upcoming { upcoming = value }
    }

    func show(_ message: String) {
        toast = message
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(for: .seconds(2.6))
            if !Task.isCancelled { toast = nil }
        }
    }

    // MARK: Location updates

    fileprivate func ingest(_ fix: CLLocation) {
        guard fix.horizontalAccuracy >= 0, fix.horizontalAccuracy < 100 else { return }
        let first = !hasGPS
        hasGPS = true
        defer { lastFix = fix }
        guard !simulating else { return }
        speed = max(0, fix.speed)
        if fix.course >= 0, speed > courseSpeed {
            heading = fix.course
        } else if let prev = lastFix, fix.distance(from: prev) > 8, speed > courseSpeed {
            heading = Geo.bearing(prev.coordinate, fix.coordinate)
        } else if let compass {
            heading = compass
        }
        position = fix.coordinate
        if first { show("GPS locked") }
    }

    /// Fallback compass (top edge of the phone). Also supplies the magnetic declination.
    fileprivate func ingest(heading h: CLHeading) {
        if h.trueHeading >= 0 { declination = Geo.angleDiff(h.magneticHeading, h.trueHeading) }
        guard Date.now.timeIntervalSince(lastCameraHeading) > 1 else { return } // camera heading is live
        let value = h.trueHeading >= 0 ? h.trueHeading : h.magneticHeading
        useCompass(value)
    }

    private func useCompass(_ value: Double) {
        compass = value
        if !simulating, speed <= courseSpeed { heading = value }
    }

    /// Works out which way the back camera faces, from gravity and the calibrated magnetic
    /// field (both in the phone's own frame), so turning the phone turns the map.
    private func startCameraHeading() {
        guard motion.isDeviceMotionAvailable,
              CMMotionManager.availableAttitudeReferenceFrames().contains(.xMagneticNorthZVertical) else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 30
        motion.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: .main) { [weak self] m, _ in
            guard let self, let m else { return }
            MainActor.assumeIsolated { self.ingest(motion: m) }
        }
    }

    private func ingest(motion m: CMDeviceMotion) {
        guard m.magneticField.accuracy != .uncalibrated else { return }
        let g = simd_double3(m.gravity.x, m.gravity.y, m.gravity.z)
        let f = m.magneticField.field
        let b = simd_double3(f.x, f.y, f.z)
        guard simd_length(g) > 0.1, simd_length(b) > 1 else { return }
        let down = simd_normalize(g)
        let horizontal = b - simd_dot(b, down) * down
        guard simd_length(horizontal) > 1e-3 else { return }
        let north = simd_normalize(horizontal)
        let east = simd_cross(down, north)
        // The back camera looks along -z; if it points at the ground, use the top of the screen instead.
        let camera = simd_double3(0, 0, -1)
        let look = abs(simd_dot(camera, down)) > 0.85 ? screenUp : camera
        let magnetic = atan2(simd_dot(look, east), simd_dot(look, north)) * 180 / .pi
        lastCameraHeading = .now
        useCompass((magnetic + declination + 720).truncatingRemainder(dividingBy: 360))
    }
}

extension Navigator: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let fix = locations.last else { return }
        MainActor.assumeIsolated { ingest(fix) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        MainActor.assumeIsolated { ingest(heading: newHeading) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
