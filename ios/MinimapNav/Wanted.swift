import Foundation
import Observation

/// Wanted level, 0–6 stars. Speeding past the posted limit earns stars, and every so often
/// a "witness" reports you at random. Stay clean and the stars start flashing, then drop
/// one at a time.
@MainActor @Observable
final class WantedLevel {
    static let maxStars = 6

    private(set) var stars = 0

    /// What the police know about you, shown as red badges under the stars.
    enum Clue: String, CaseIterable {
        case witnesses = "person.2.fill"
        case clothing = "hanger"
        case face = "person.fill"
        case vehicle = "car.fill"
    }
    private(set) var clues: [Clue] = []

    private func learn(_ clue: Clue) {
        if !clues.contains(clue) { clues.append(clue) }
        clues.sort { Clue.allCases.firstIndex(of: $0)! < Clue.allCases.firstIndex(of: $1)! }
    }
    /// A random reported detail (who saw you, what you wore, your face).
    private func learnSomething() {
        let unknown = [Clue.witnesses, .clothing, .face].filter { !clues.contains($0) }
        if let c = unknown.randomElement() { learn(c) }
    }
    /// Stars blink right after going up.
    private(set) var justRaised = false
    /// Stars blink slowly while they're about to drop.
    private(set) var evading = false
    /// The speed limit of the road you're on, km/h, when known.
    private(set) var limit: Double?

    @ObservationIgnored private var speedingFor: TimeInterval = 0
    @ObservationIgnored private var cleanFor: TimeInterval = 0
    @ObservationIgnored private var nextRandom = Date.now.addingTimeInterval(.random(in: 90...240))
    @ObservationIgnored private var raisedAt: Date?
    @ObservationIgnored private let limits = SpeedLimits()
    @ObservationIgnored private let units = PoliceUnits()
    /// Where the pretend police cars are (one per star).
    @ObservationIgnored private(set) var police: [Coord] = []

    /// Call about once a second.
    func tick(position: Coord?, speed: Double, dt: TimeInterval) {
        if let position { limits.update(near: position, speed: speed) }
        limit = limits.current
        let kmh = speed * 3.6
        var offence = false

        // Speeding: 10% (and at least 5 km/h) over for 3 s earns a star, then another every 15 s
        // you keep it up. Way over the limit starts you higher.
        if let limit, kmh > max(limit * 1.1, limit + 5) {
            offence = true
            speedingFor += dt
            let over = kmh - limit
            let floor = over > 50 ? 3 : over > 30 ? 2 : 1
            if speedingFor >= 3 {
                if stars < floor { raise(to: floor); learn(.vehicle) }
                else if speedingFor >= 18 { raise(to: stars + 1); speedingFor = 3; learn(.vehicle) }
            }
        } else {
            speedingFor = 0
        }

        // Random reports, only while actually moving.
        if Date.now >= nextRandom {
            nextRandom = .now.addingTimeInterval(.random(in: 90...300))
            if speed > 4, Double.random(in: 0...1) < 0.4 {
                raise(to: stars + 1)
                learn(.witnesses)
                learnSomething()
                offence = true
            }
        }

        // Cooling off: 30 s of clean driving → flash; 15 s more → lose a star.
        // Standing still doesn't count, so the stars stay put until you drive.
        if offence || stars == 0 {
            cleanFor = 0
            evading = false
        } else if speed > 3 {
            cleanFor += dt
            evading = cleanFor >= 30
            if cleanFor >= 45 {
                stars -= 1
                if stars == 0 { clues = [] }
                cleanFor = 30 // keep flashing toward the next drop
                if stars == 0 { evading = false }
            }
        }

        if let raisedAt, Date.now.timeIntervalSince(raisedAt) > 2.5 { justRaised = false }
        if let position { police = units.update(dt: dt, player: position, playerSpeed: speed, count: stars) }
    }

    /// Getting wanted always starts you at 2 stars.
    /// Test buttons: add a star, or clear the wanted level.
    func addStar() {
        raise(to: stars + 1)
        if clues.count < Clue.allCases.count {
            learn(Clue.allCases.filter { !clues.contains($0) }.randomElement()!)
        }
    }
    func clear() {
        stars = 0
        clues = []
        justRaised = false
        evading = false
        cleanFor = 0
    }

    private func raise(to n: Int) {
        let n = min(max(n, 2), Self.maxStars)
        guard n > stars else { return }
        stars = n
        justRaised = true
        raisedAt = .now
        cleanFor = 0
        evading = false
    }
}

/// Looks up the posted speed limit of the nearest road from OpenStreetMap (Overpass API),
/// re-checking as you move. Roads without a tagged limit fall back to New Zealand defaults
/// only where they're unambiguous.
@MainActor
final class SpeedLimits {
    private(set) var current: Double?
    private var lastQuery: (at: Coord, time: Date)?
    private var inFlight = false

    func update(near p: Coord, speed: Double) {
        guard !inFlight else { return }
        if let last = lastQuery {
            let moved = Geo.distance(last.at, p)
            let age = Date.now.timeIntervalSince(last.time)
            // Re-check every ~120 m, or every 30 s if crawling; drop a stale limit after 2 min still.
            guard moved > 120 || (age > 30 && moved > 20) else {
                if age > 120 { current = nil }
                return
            }
        }
        lastQuery = (p, .now)
        inFlight = true
        Task {
            defer { inFlight = false }
            // The public server is often busy: keep the last limit on failure and retry on the next check.
            if let found = try? await Self.fetch(near: p) { current = found }
        }
    }

    private struct Response: Decodable {
        struct Element: Decodable {
            struct Point: Decodable { let lat: Double; let lon: Double }
            let tags: [String: String]?
            let geometry: [Point]?
        }
        let elements: [Element]
    }

    /// The road's limit; nil when it has none. Throws when the lookup itself failed.
    private static func fetch(near p: Coord) async throws -> Double? {
        let kinds = drivable.joined(separator: "|")
        let query = "[out:json][timeout:8];way(around:25,\(p.latitude),\(p.longitude))[highway~\"^(\(kinds))$\"];out tags geom;"
        var c = URLComponents(string: "https://overpass-api.de/api/interpreter")!
        c.queryItems = [.init(name: "data", value: query)]
        let (data, response) = try await URLSession.shared.data(for: URLRequest(url: c.url!, timeoutInterval: 10))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ServiceError.badResponse }
        let decoded = try JSONDecoder().decode(Response.self, from: data)

        // Nearest drivable road wins.
        let ways = decoded.elements.compactMap { e -> (limit: Double?, offset: Double)? in
            guard let tags = e.tags, let highway = tags["highway"], drivable.contains(highway),
                  let geom = e.geometry, geom.count > 1 else { return nil }
            let track = Track(geom.map { Coord(latitude: $0.lat, longitude: $0.lon) })
            return (parse(tags["maxspeed"]) ?? defaults[highway], track.snap(p).offset)
        }
        return ways.min { $0.offset < $1.offset }?.limit
    }

    private static let drivable: Set<String> = [
        "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary",
        "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service",
    ]
    private static let defaults: [String: Double] = [
        "motorway": 100, "residential": 50, "living_street": 10,
    ]

    /// "50", "30 mph", "NZ:urban", "NZ:rural" → km/h.
    private static func parse(_ raw: String?) -> Double? {
        guard let raw = raw?.lowercased().trimmingCharacters(in: .whitespaces) else { return nil }
        if raw.hasSuffix(":urban") { return 50 }
        if raw.hasSuffix(":rural") { return 100 }
        if raw.hasSuffix(":motorway") { return 100 }
        let digits = raw.prefix { $0.isNumber || $0 == "." }
        guard let n = Double(digits), n > 0 else { return nil }
        return raw.contains("mph") ? n * 1.609 : n
    }
}
