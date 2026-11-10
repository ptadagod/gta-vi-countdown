import CoreLocation

typealias Coord = CLLocationCoordinate2D

enum Geo {
    private static let earthRadius = 6_371_008.8

    static func distance(_ a: Coord, _ b: Coord) -> Double {
        let dLat = (b.latitude - a.latitude) * .pi / 180
        let dLng = (b.longitude - a.longitude) * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2)
            + cos(a.latitude * .pi / 180) * cos(b.latitude * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * earthRadius * asin(min(1, sqrt(h)))
    }

    /// Initial bearing from a to b, degrees clockwise from north.
    static func bearing(_ a: Coord, _ b: Coord) -> Double {
        let lat1 = a.latitude * .pi / 180, lat2 = b.latitude * .pi / 180
        let dLng = (b.longitude - a.longitude) * .pi / 180
        let y = sin(dLng) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
        return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }

    /// Signed shortest turn from a to b, in degrees (-180...180).
    static func angleDiff(_ a: Double, _ b: Double) -> Double {
        var d = (b - a).truncatingRemainder(dividingBy: 360)
        if d > 180 { d -= 360 }
        if d < -180 { d += 360 }
        return d
    }

    static func lerp(_ a: Coord, _ b: Coord, _ t: Double) -> Coord {
        Coord(latitude: a.latitude + (b.latitude - a.latitude) * t,
              longitude: a.longitude + (b.longitude - a.longitude) * t)
    }
}

/// A route line with cumulative distances, for snapping, slicing and simulated driving.
struct Track {
    let coords: [Coord]
    let cum: [Double]
    var length: Double { cum.last ?? 0 }

    init(_ coords: [Coord]) {
        self.coords = coords
        var cum = [0.0]
        for i in coords.indices.dropFirst() { cum.append(cum[i - 1] + Geo.distance(coords[i - 1], coords[i])) }
        self.cum = cum
    }

    private func segment(containing s: Double) -> Int {
        var lo = 1, hi = max(1, cum.count - 1)
        while lo < hi {
            let mid = (lo + hi) / 2
            if cum[mid] < s { lo = mid + 1 } else { hi = mid }
        }
        return lo
    }

    func point(at s: Double) -> Coord {
        guard coords.count > 1 else { return coords.first ?? Coord() }
        let s = min(max(0, s), length)
        let i = segment(containing: s)
        let seg = cum[i] - cum[i - 1]
        return Geo.lerp(coords[i - 1], coords[i], seg > 0 ? (s - cum[i - 1]) / seg : 0)
    }

    /// Distance along the line of the nearest point, and how far `p` is from it (metres).
    func snap(_ p: Coord) -> (along: Double, offset: Double) {
        let kx = cos(p.latitude * .pi / 180) * 111_320, ky = 110_540.0
        var best = (along: 0.0, offset: Double.infinity)
        for i in coords.indices.dropFirst() {
            let ax = (coords[i - 1].longitude - p.longitude) * kx, ay = (coords[i - 1].latitude - p.latitude) * ky
            let bx = (coords[i].longitude - p.longitude) * kx, by = (coords[i].latitude - p.latitude) * ky
            let dx = bx - ax, dy = by - ay
            let len2 = max(dx * dx + dy * dy, 1e-9)
            let t = min(1, max(0, -(ax * dx + ay * dy) / len2))
            let d = hypot(ax + dx * t, ay + dy * t)
            if d < best.offset { best = (cum[i - 1] + (cum[i] - cum[i - 1]) * t, d) }
        }
        return best
    }

    func slice(from s: Double) -> [Coord] {
        guard coords.count > 1 else { return coords }
        let i = segment(containing: min(max(0, s), length))
        return [point(at: s)] + coords[i...]
    }
}
