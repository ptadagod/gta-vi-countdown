import CoreLocation
import UIKit

/// Pretend police cars that close in on you while you're wanted: one per star. They appear
/// a few hundred metres away, drive toward you with a bit of weaving, and circle once close.
/// Purely for show; they don't follow real roads. Shown as glows at the screen edge.
@MainActor
final class PoliceUnits {
    private struct Unit {
        var pos: Coord
        var heading: Double // degrees
        var wobble: Double  // phase for weaving
    }
    private var units: [Unit] = []
    private var time = 0.0

    func update(dt: Double, player: Coord, playerSpeed: Double, count: Int) -> [Coord] {
        time += dt
        if units.count > count { units.removeLast(units.count - count) }
        while units.count < count { units.append(spawn(near: player)) }

        let chase = min(max(playerSpeed * 1.15 + 5, 9), 34) // m/s
        for i in units.indices {
            var u = units[i]
            let dist = Geo.distance(u.pos, player)
            if dist > 1500 { units[i] = spawn(near: player); continue }
            let toPlayer = Geo.bearing(u.pos, player)
            // Far: head for you, weaving. Close: circle at a short distance.
            let target = dist > 140
                ? toPlayer + sin(time * 0.7 + u.wobble) * 35
                : toPlayer + 90 + (dist < 70 ? 25 : 0)
            let turn = Geo.angleDiff(u.heading, target)
            u.heading += max(-90 * dt, min(90 * dt, turn)) // up to 90°/s
            let speed = dist > 140 ? chase : max(playerSpeed, 8)
            u.pos = Self.offset(u.pos, bearing: u.heading, metres: speed * dt)
            units[i] = u
        }
        return units.map(\.pos)
    }

    private func spawn(near p: Coord) -> Unit {
        let bearing = Double.random(in: 0..<360)
        let pos = Self.offset(p, bearing: bearing, metres: .random(in: 350...700))
        return Unit(pos: pos, heading: Geo.bearing(pos, p), wobble: .random(in: 0...(2 * .pi)))
    }

    private static func offset(_ p: Coord, bearing: Double, metres d: Double) -> Coord {
        let b = bearing * .pi / 180
        return Coord(latitude: p.latitude + cos(b) * d / 111_320,
                     longitude: p.longitude + sin(b) * d / (111_320 * cos(p.latitude * .pi / 180)))
    }
}

/// Soft red/blue glows at the screen edge in the direction each police car is coming from,
/// relative to where you're facing: ahead → top, behind → bottom, left/right → sides.
/// Stronger as they get closer.
@MainActor
final class PoliceGlowModel {
    struct Glow {
        let center: CGPoint // points, top-left origin
        let radius: CGFloat
        let r, g, b, a: Double
    }

    private var angles: [Double] = []
    private var strengths: [Double] = []
    private var last: Date?

    func glows(in size: CGSize, at now: Date, nav: Navigator, wanted: WantedLevel) -> [Glow] {
        let dt = min(0.5, max(0, now.timeIntervalSince(last ?? now)))
        last = now
        var cops = wanted.stars > 0 ? wanted.police : []
        // At most two sets of lights (the two nearest cars); more stars make them stronger instead.
        if let here = nav.position, cops.count > 2 {
            cops = Array(cops.sorted { Geo.distance($0, here) < Geo.distance($1, here) }.prefix(2))
        }
        let intensity = 0.55 + 0.09 * Double(min(wanted.stars, WantedLevel.maxStars)) // 2★ ≈ 0.73, 6★ ≈ 1.1
        guard let pos = nav.position else { return [] }

        let n = max(cops.count, angles.count)
        while angles.count < n { angles.append(cops.isEmpty ? 0 : Geo.angleDiff(nav.heading, Geo.bearing(pos, cops[angles.count]))) }
        while strengths.count < n { strengths.append(0) }
        let k = 1 - exp(-3 * dt)
        for i in 0..<n {
            var target = 0.0
            if i < cops.count {
                let rel = Geo.angleDiff(nav.heading, Geo.bearing(pos, cops[i]))
                angles[i] += Geo.angleDiff(angles[i], rel) * k
                target = min(1, max(0.55, 1 - Geo.distance(pos, cops[i]) / 1500))
            }
            strengths[i] += (target - strengths[i]) * k
        }
        while let s = strengths.last, s < 0.01, strengths.count > cops.count {
            strengths.removeLast(); angles.removeLast()
        }

        // A tight red + blue pair on the screen edge, like a light bar glimpsed behind you.
        let c = CGPoint(x: size.width / 2, y: size.height / 2)
        let radius = min(size.width, size.height) * 0.15 * (0.85 + 0.05 * Double(wanted.stars))
        let t = now.timeIntervalSinceReferenceDate
        return angles.indices.flatMap { i -> [Glow] in
            let a = angles[i] * .pi / 180
            let dx = sin(a), dy = -cos(a)
            let reach = min(abs(dx) > 1e-6 ? c.x / abs(dx) : .infinity, abs(dy) > 1e-6 ? c.y / abs(dy) : .infinity)
            let edge = CGPoint(x: c.x + dx * reach, y: c.y + dy * reach)
            // Push half off-screen; lights side by side along the edge.
            let tx = -dy, ty = dx
            let spread = radius * 0.55
            // Smooth alternate: red swells while blue eases off, then the other way.
            let wave = (1 + sin(t * 2 * .pi / 1.6 + Double(i) * 1.3)) / 2
            let base = min(1, strengths[i] * 1.35 * intensity)
            let push = CGPoint(x: dx * radius * 0.25, y: dy * radius * 0.25)
            let at = { (side: Double) in CGPoint(x: edge.x + tx * spread * side + push.x, y: edge.y + ty * spread * side + push.y) }
            // Red, white, blue. Each light swells and shrinks like a wave: red grows as blue
            // shrinks and back again, and the white core breathes on its own quicker beat.
            let pulse = (1 + sin(t * 2 * .pi / 0.8 + Double(i))) / 2
            return [
                Glow(center: at(-1), radius: radius * (0.6 + 0.6 * wave),
                     r: 1, g: 0.1, b: 0.15, a: base * (0.65 + 0.35 * wave)),
                Glow(center: at(1), radius: radius * (0.6 + 0.6 * (1 - wave)),
                     r: 0.1, g: 0.35, b: 1, a: base * (0.65 + 0.35 * (1 - wave))),
                Glow(center: at(0), radius: radius * (0.45 + 0.3 * pulse),
                     r: 1, g: 1, b: 1, a: base * (0.75 + 0.25 * pulse)),
            ]
        }
    }
}

import SwiftUI

/// Draws the police glows full screen, under the HUD.
struct PoliceGlowLayer: View {
    let model: PoliceGlowModel
    let nav: Navigator
    let wanted: WantedLevel

    var body: some View {
        TimelineView(.animation) { t in
            Canvas { ctx, size in
                for g in model.glows(in: size, at: t.date, nav: nav, wanted: wanted) {
                    let color = Color(red: g.r, green: g.g, blue: g.b)
                    let rect = CGRect(x: g.center.x - g.radius, y: g.center.y - g.radius, width: g.radius * 2, height: g.radius * 2)
                    ctx.fill(Path(ellipseIn: rect), with: .radialGradient(
                        Gradient(stops: [.init(color: color.opacity(g.a), location: 0), .init(color: color.opacity(g.a * 0.85), location: 0.3), .init(color: color.opacity(g.a * 0.35), location: 0.65), .init(color: color.opacity(0), location: 1)]),
                        center: g.center, startRadius: 0, endRadius: g.radius))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
