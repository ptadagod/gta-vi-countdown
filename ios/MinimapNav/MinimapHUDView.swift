import MapLibre
import SwiftUI
import UIKit

/// The minimap: a MapLibre map in the shared minimap style, following the player
/// heading-up with a tilted camera, plus the HUD drawn on top (distance, player
/// arrow, waypoint pinned to the edge when off-screen, and the north marker).
final class MinimapHUDView: UIView, MLNMapViewDelegate {
    static let pink = UIColor(red: 0.988, green: 0.502, blue: 0.682, alpha: 1) // #fc80ae
    private static let pitch: CGFloat = 45

    weak var navigator: Navigator?
    weak var wanted: WantedLevel?
    private var tintRed: Bool?

    private let map: MLNMapView
    private let haze = CAGradientLayer()
    private let distanceLabel = UILabel()
    private let player = PlayerMarker()
    private let waypoint = WaypointMarker()
    private let north = UILabel()
    private var link: CADisplayLink?
    private var styleReady = false

    // Eased display state
    private var shownPos: Coord?
    private var shownHeading: Double = 0
    private var cameraHeading: Double = 0
    private var zoom: Double = 15.8
    private var lastTick: CFTimeInterval = 0
    private var drawnRevision = -1
    private var waypointPoint: CGPoint?
    private var waypointFocus: CGFloat = 0 // 0 = pinned to the edge, 1 = shown at the destination

    override init(frame: CGRect) {
        let styleURL = Bundle.main.url(forResource: "minimap-style", withExtension: "json")
        map = MLNMapView(frame: .zero, styleURL: styleURL)
        super.init(frame: frame)

        // The map is drawn at 75% opacity so the camera shows through; markers stay solid.
        backgroundColor = .clear
        layer.cornerRadius = 16
        layer.cornerCurve = .continuous
        clipsToBounds = true

        map.delegate = self
        map.isOpaque = false
        map.alpha = 0.75
        map.backgroundColor = .clear
        map.isUserInteractionEnabled = false
        map.automaticallyAdjustsContentInset = false
        map.logoView.isHidden = true
        map.compassView.compassVisibility = .hidden
        map.showsScale = false
        map.attributionButtonPosition = .bottomRight
        map.attributionButtonMargins = CGPoint(x: 4, y: 4)
        map.attributionButton.alpha = 0.5
        map.attributionButton.isUserInteractionEnabled = true
        map.maximumPitch = 60
        map.zoomLevel = zoom
        map.setCenter(Navigator.fallback, animated: false)
        addSubview(map)

        // Light haze toward the far (top) edge, like atmospheric distance.
        let hazeColor = UIColor(red: 0.91, green: 0.886, blue: 0.835, alpha: 1)
        haze.colors = [hazeColor.withAlphaComponent(0.8).cgColor, hazeColor.withAlphaComponent(0.25).cgColor, UIColor.clear.cgColor]
        haze.locations = [0, 0.16, 0.36]
        layer.addSublayer(haze)

        distanceLabel.font = .systemFont(ofSize: 14, weight: .heavy, width: .condensed)
        distanceLabel.textColor = .white
        distanceLabel.layer.shadowColor = UIColor.black.cgColor
        distanceLabel.layer.shadowOpacity = 0.55
        distanceLabel.layer.shadowRadius = 2
        distanceLabel.layer.shadowOffset = CGSize(width: 0, height: 1)
        distanceLabel.isHidden = true

        north.text = "N"
        north.font = .systemFont(ofSize: 10, weight: .heavy, width: .condensed)
        north.textColor = .white
        north.textAlignment = .center
        north.backgroundColor = .black
        north.layer.cornerRadius = 8
        north.layer.borderWidth = 1
        north.layer.borderColor = UIColor(white: 1, alpha: 0.85).cgColor
        north.clipsToBounds = true
        north.bounds = CGRect(x: 0, y: 0, width: 16, height: 16)

        waypoint.isHidden = true
        for v in [waypoint, north, player, distanceLabel] as [UIView] { addSubview(v) }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        map.frame = bounds
        // Push the map centre (the player) down to ~70% of the height, like the game.
        map.contentInset = UIEdgeInsets(top: bounds.height * 0.4, left: 0, bottom: 0, right: 0)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        haze.frame = bounds
        CATransaction.commit()
        distanceLabel.frame = CGRect(x: 10, y: 6, width: bounds.width - 20, height: 18)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        link?.invalidate()
        link = nil
        guard window != nil else { return }
        let l = CADisplayLink(target: WeakTarget(self), selector: #selector(WeakTarget.tick(_:)))
        l.add(to: .main, forMode: .common)
        link = l
    }

    func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
        addPoliceTint(style)
        styleReady = true
        drawnRevision = -1
        let cam = mapView.camera
        cam.pitch = Self.pitch
        mapView.setCamera(cam, animated: false)
    }

    // MARK: Frame loop

    fileprivate func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = lastTick == 0 ? 1.0 / 60 : min(1, now - lastTick)
        lastTick = now
        guard let nav = navigator else { return }
        MainActor.assumeIsolated { nav.step(dt) }
        guard let target = nav.position else { return }

        let ease = { (rate: Double) in 1 - exp(-rate * dt) }
        shownPos = shownPos.map { nav.simulating ? target : Geo.lerp($0, target, ease(4)) } ?? target
        // Snappier when turning the phone on the spot, steadier when driving.
        let turning = nav.speed <= 4 && !nav.simulating
        shownHeading = (shownHeading + Geo.angleDiff(shownHeading, nav.heading) * ease(turning ? 9 : 6) + 360)
            .truncatingRemainder(dividingBy: 360)
        // The map turns with you, so you always face straight up.
        cameraHeading = shownHeading

        // Zoom out with speed, and pull back briefly when a new route arrives.
        let fast = min(1, nav.speed / 28)
        var targetZoom = 15.8 - fast * 1.1
        if let arrived = nav.routeArrivedAt, Date.now.timeIntervalSince(arrived) < 2.5 { targetZoom -= 1.8 }
        zoom += (targetZoom - zoom) * ease(1.5)

        if let p = shownPos {
            map.setCenter(p, zoomLevel: zoom, direction: cameraHeading, animated: false)
        }
        if styleReady, nav.routeRevision != drawnRevision {
            drawnRevision = nav.routeRevision
            drawRoutes(nav)
        }
        layoutHUD(nav, dt: dt)
        updatePoliceTint(now: now)
    }

    private func drawRoutes(_ nav: Navigator) {
        guard let style = map.style,
              let route = style.source(withIdentifier: "route") as? MLNShapeSource,
              let alts = style.source(withIdentifier: "alts") as? MLNShapeSource else { return }
        let (r, routes, active, along, moving) = MainActor.assumeIsolated {
            (nav.activeRoute, nav.routes, nav.active, nav.along, nav.simulating || nav.speed > 2)
        }
        if let r {
            var coords = r.track.slice(from: along)
            route.shape = MLNPolylineFeature(coordinates: &coords, count: UInt(coords.count))
            fadeRoute(style, remaining: r.track.length - along)
        } else {
            route.shape = MLNShapeCollectionFeature(shapes: [])
        }
        let showAlts = r != nil && !moving && along < 50
        let altLines: [MLNPolylineFeature] = showAlts ? routes.enumerated().compactMap { i, x in
            guard i != active else { return nil }
            var c = x.track.coords
            return MLNPolylineFeature(coordinates: &c, count: UInt(c.count))
        } : []
        alts.shape = MLNShapeCollectionFeature(shapes: altLines)
    }

    /// The route fades out over its last stretch into the player, like the game's GPS line.
    private func fadeRoute(_ style: MLNStyle, remaining: Double) {
        let fade = min(0.5, 70 / max(remaining, 1)) // ~70 m, as a fraction of the visible route
        let casing = UIColor(red: 0.72, green: 0.12, blue: 0.41, alpha: 1)
        for (id, color) in [("route", Self.pink), ("route-glow", Self.pink), ("route-casing", casing)] {
            guard let layer = style.layer(withIdentifier: id) as? MLNLineStyleLayer else { continue }
            layer.lineGradient = NSExpression(
                forMLNInterpolating: .lineProgressVariable,
                curveType: .linear,
                parameters: nil,
                stops: NSExpression(forConstantValue: [0: color.withAlphaComponent(0), fade: color]))
        }
    }

    /// The wanted flash lives inside the map, as a world-sized fill just under the route
    /// layers, so the pink route stays on top of the red/blue.
    private func addPoliceTint(_ style: MLNStyle) {
        guard style.layer(withIdentifier: "police-tint") == nil else { return }
        var world = [Coord(latitude: -85, longitude: -180), Coord(latitude: -85, longitude: 180),
                     Coord(latitude: 85, longitude: 180), Coord(latitude: 85, longitude: -180),
                     Coord(latitude: -85, longitude: -180)]
        let source = MLNShapeSource(identifier: "police-tint",
                                    shape: MLNPolygonFeature(coordinates: &world, count: UInt(world.count)))
        style.addSource(source)
        let layer = MLNFillStyleLayer(identifier: "police-tint", source: source)
        layer.fillOpacity = NSExpression(forConstantValue: 0)
        layer.fillAntialiased = NSExpression(forConstantValue: false)
        if let below = ["alts", "route-glow", "route-casing", "route"].lazy.compactMap({ style.layer(withIdentifier: $0) }).first {
            style.insertLayer(layer, below: below)
        } else {
            style.addLayer(layer)
        }
    }

    /// Hard switch between red and blue every 0.6 s while wanted.
    private func updatePoliceTint(now: CFTimeInterval) {
        guard let layer = map.style?.layer(withIdentifier: "police-tint") as? MLNFillStyleLayer else { return }
        let stars = MainActor.assumeIsolated { wanted?.stars ?? 0 }
        // No pale haze over the police colours.
        if haze.isHidden != (stars > 0) {
            CATransaction.begin(); CATransaction.setDisableActions(true)
            haze.isHidden = stars > 0
            CATransaction.commit()
        }
        let red: Bool? = stars > 0 ? Int(Date.now.timeIntervalSinceReferenceDate / 0.6) % 2 == 0 : nil
        guard red != tintRed else { return }
        tintRed = red
        guard let red else {
            layer.fillOpacity = NSExpression(forConstantValue: 0)
            return
        }
        let color = red ? UIColor(red: 1, green: 0.12, blue: 0.18, alpha: 1) : UIColor(red: 0.12, green: 0.38, blue: 1, alpha: 1)
        layer.fillColor = NSExpression(forConstantValue: color)
        layer.fillOpacity = NSExpression(forConstantValue: min(0.75, 0.5 + Double(stars) * 0.03))
    }

    private func layoutHUD(_ nav: Navigator, dt: Double) {
        guard let pos = shownPos else { return }
        let mapBearing = map.direction
        let p = map.convert(pos, toPointTo: self)
        player.isHidden = false
        player.center = p
        player.transform = CGAffineTransform(rotationAngle: (shownHeading - mapBearing) * .pi / 180)

        north.center = rayToEdge(from: p, angle: -mapBearing, inset: 12)

        let (dest, remaining, routing) = MainActor.assumeIsolated { (nav.destination, nav.remaining, nav.isRouting) }
        if let dest {
            placeWaypoint(dest.coord, player: pos, playerPoint: p, dt: dt)
        } else {
            waypoint.isHidden = true
            waypointPoint = nil
        }

        if let remaining {
            distanceLabel.isHidden = false
            distanceLabel.text = Self.format(remaining)
        } else {
            distanceLabel.isHidden = !(dest != nil && routing)
            distanceLabel.text = "···"
        }
    }

    /// Pins the waypoint to the frame edge in the destination's direction, and lets it glide
    /// in to the real spot once the destination is within the area the minimap shows.
    private func placeWaypoint(_ dest: Coord, player pos: Coord, playerPoint p: CGPoint, dt: Double) {
        let inset: CGFloat = 14
        let distance = Geo.distance(pos, dest)

        // How far the minimap can see: the farthest of its top corners (the tilt makes the top reach furthest).
        let reach = [CGPoint(x: 0, y: 0), CGPoint(x: bounds.width, y: 0)]
            .map { Geo.distance(pos, map.convert($0, toCoordinateFrom: self)) }
            .max() ?? 0

        let q = map.convert(dest, toPointTo: self)
        let inFrame = q.x.isFinite && q.y.isFinite && q.x > inset && q.x < bounds.width - inset
            && q.y > inset && q.y < bounds.height - inset
        let visible = inFrame && distance < reach * 0.95

        // Direction on screen: project a point a short way toward the destination, so the
        // tilted perspective is accounted for.
        let step = Geo.lerp(pos, dest, min(1, 40 / max(distance, 1)))
        let s = map.convert(step, toPointTo: self)
        let angle = atan2(s.x - p.x, -(s.y - p.y)) * 180 / .pi
        let edge = rayToEdge(from: p, angle: angle.isFinite ? angle : 0, inset: inset)

        waypointFocus += ((visible ? 1 : 0) - waypointFocus) * (1 - exp(-6 * dt))
        let target = CGPoint(x: edge.x + (q.x - edge.x) * waypointFocus, y: edge.y + (q.y - edge.y) * waypointFocus)
        let current = waypointPoint ?? target
        let k = 1 - exp(-14 * dt)
        let next = CGPoint(x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k)
        waypointPoint = next.x.isFinite && next.y.isFinite ? next : edge

        waypoint.isHidden = false
        waypoint.center = waypointPoint!
        let scale = 0.8 + 0.2 * waypointFocus
        waypoint.transform = CGAffineTransform(scaleX: scale, y: scale)
        waypoint.alpha = 0.85 + 0.15 * waypointFocus
    }

    private func rayToEdge(from o: CGPoint, angle: Double, inset: CGFloat) -> CGPoint {
        let a = angle * .pi / 180
        let dx = sin(a), dy = -cos(a)
        let w = bounds.width, h = bounds.height
        var t = CGFloat.infinity
        if dx > 1e-6 { t = min(t, (w - inset - o.x) / dx) }
        if dx < -1e-6 { t = min(t, (inset - o.x) / dx) }
        if dy > 1e-6 { t = min(t, (h - inset - o.y) / dy) }
        if dy < -1e-6 { t = min(t, (inset - o.y) / dy) }
        return t.isFinite ? CGPoint(x: o.x + dx * t, y: o.y + dy * t) : o
    }

    static func format(_ m: Double) -> String {
        if Locale.current.measurementSystem == .us {
            let mi = m / 1609.344
            return mi < 0.1 ? "\(Int((m * 3.28084 / 10).rounded()) * 10) ft" : String(format: mi < 10 ? "%.1f mi" : "%.0f mi", mi)
        }
        return m < 1000 ? "\(max(10, Int((m / 10).rounded()) * 10)) m" : String(format: m < 10_000 ? "%.1f km" : "%.0f km", m / 1000)
    }
}

/// Breaks the CADisplayLink → view retain cycle.
private final class WeakTarget: NSObject {
    weak var view: MinimapHUDView?
    init(_ view: MinimapHUDView) { self.view = view }
    @objc func tick(_ link: CADisplayLink) { view?.tick(link) }
}

/// Black disc with a white arrow, pointing up when heading == map bearing.
private final class PlayerMarker: UIView {
    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: 18, height: 18))
        isHidden = true
        let disc = CAShapeLayer()
        disc.path = UIBezierPath(ovalIn: bounds.insetBy(dx: 1, dy: 1)).cgPath
        disc.fillColor = UIColor(white: 0.07, alpha: 1).cgColor
        disc.strokeColor = UIColor(white: 1, alpha: 0.92).cgColor
        disc.lineWidth = 1.1
        disc.shadowColor = UIColor.black.cgColor
        disc.shadowOpacity = 0.35
        disc.shadowRadius = 2
        disc.shadowOffset = CGSize(width: 0, height: 1.5)
        let arrow = CAShapeLayer()
        let s = bounds.width / 32
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 16 * s, y: 6.5 * s))
        path.addLine(to: CGPoint(x: 23.2 * s, y: 23.5 * s))
        path.addLine(to: CGPoint(x: 16 * s, y: 19.6 * s))
        path.addLine(to: CGPoint(x: 8.8 * s, y: 23.5 * s))
        path.close()
        arrow.path = path.cgPath
        arrow.fillColor = UIColor.white.cgColor
        arrow.lineJoin = .round
        layer.addSublayer(disc)
        layer.addSublayer(arrow)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}

/// Pink waypoint dot with a white ring and a soft ping.
private final class WaypointMarker: UIView {
    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: 14, height: 14))
        let pink = MinimapHUDView.pink
        let ping = CAShapeLayer()
        ping.path = UIBezierPath(ovalIn: bounds).cgPath
        ping.frame = bounds
        ping.fillColor = UIColor.clear.cgColor
        ping.strokeColor = pink.cgColor
        ping.lineWidth = 1.5
        let grow = CABasicAnimation(keyPath: "transform.scale")
        grow.fromValue = 1
        grow.toValue = 2.4
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0.8
        fade.toValue = 0
        let group = CAAnimationGroup()
        group.animations = [grow, fade]
        group.duration = 1.8
        group.repeatCount = .infinity
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        group.isRemovedOnCompletion = false
        ping.add(group, forKey: "ping")

        let dot = CAShapeLayer()
        dot.path = UIBezierPath(ovalIn: bounds).cgPath
        dot.fillColor = pink.cgColor
        dot.strokeColor = UIColor.white.cgColor
        dot.lineWidth = 2
        dot.shadowColor = pink.cgColor
        dot.shadowOpacity = 0.8
        dot.shadowRadius = 5
        dot.shadowOffset = .zero
        layer.addSublayer(ping)
        layer.addSublayer(dot)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}

struct MinimapView: UIViewRepresentable {
    let navigator: Navigator
    let wanted: WantedLevel

    func makeUIView(context: Context) -> MinimapHUDView {
        let v = MinimapHUDView(frame: .zero)
        v.navigator = navigator
        v.wanted = wanted
        return v
    }

    func updateUIView(_ v: MinimapHUDView, context: Context) {
        v.navigator = navigator
        v.wanted = wanted
    }
}
