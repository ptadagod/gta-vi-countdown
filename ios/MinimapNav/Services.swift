import Foundation

struct RouteOption {
    let track: Track
    let distance: Double // metres
    let duration: Double // seconds
    let maneuvers: [Maneuver]
}

/// One turn instruction, placed at a distance along its route.
struct Maneuver {
    let along: Double // metres from the start of the route
    let text: String
    let symbol: String // SF Symbol

    init(type: String, modifier: String?, exit: Int?, street: String, along: Double) {
        self.along = along
        let m = modifier ?? "straight"
        let onto = street.isEmpty ? "" : " onto \(street)"
        let turnSymbol: String = switch m {
        case "left", "sharp left": "arrow.turn.up.left"
        case "right", "sharp right": "arrow.turn.up.right"
        case "slight left": "arrow.up.left"
        case "slight right": "arrow.up.right"
        case "uturn": "arrow.uturn.left"
        default: "arrow.up"
        }
        let direction = m == "uturn" ? "Make a U-turn" : m == "straight" ? "Continue straight" : "Turn \(m)"
        switch type {
        case "arrive":
            text = "Arrive at destination"
            symbol = "flag.checkered"
        case "depart":
            text = street.isEmpty ? "Head out" : "Head along \(street)"
            symbol = "arrow.up"
        case "roundabout", "rotary":
            let ordinal = exit.map { [1: "1st", 2: "2nd", 3: "3rd"][$0] ?? "\($0)th" } ?? "next"
            text = "At the roundabout, take the \(ordinal) exit\(onto)"
            symbol = "arrow.triangle.turn.up.right.circle"
        case "roundabout turn", "exit roundabout", "exit rotary":
            text = "At the roundabout, \(direction.lowercased())\(onto)"
            symbol = "arrow.triangle.turn.up.right.circle"
        case "merge":
            text = "Merge\(m == "straight" ? "" : " \(m)")\(onto)"
            symbol = "arrow.triangle.merge"
        case "on ramp":
            text = "Take the ramp\(m == "straight" ? "" : " on the \(m.replacingOccurrences(of: "slight ", with: ""))")\(onto)"
            symbol = turnSymbol
        case "off ramp":
            text = "Take the exit\(m == "straight" ? "" : " on the \(m.replacingOccurrences(of: "slight ", with: ""))")\(onto)"
            symbol = turnSymbol
        case "fork":
            text = "Keep \(m.replacingOccurrences(of: "slight ", with: ""))\(onto)"
            symbol = m.contains("left") ? "arrow.up.left" : m.contains("right") ? "arrow.up.right" : "arrow.triangle.branch"
        case "new name", "continue", "notification":
            let turns = ["left", "right", "sharp left", "sharp right", "uturn"].contains(m)
            text = turns ? "\(direction)\(onto)" : "Continue\(onto)"
            symbol = turns ? turnSymbol : "arrow.up"
        default: // turn, end of road
            text = "\(direction)\(onto)"
            symbol = turnSymbol
        }
    }
}

struct Place: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let subtitle: String
    let coord: Coord

    static func == (a: Place, b: Place) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

enum ServiceError: LocalizedError {
    case noRoute, badResponse
    var errorDescription: String? {
        switch self {
        case .noRoute: "No route found"
        case .badResponse: "Routing unavailable"
        }
    }
}

/// Same free services as the web minimap: OSRM for driving routes, Photon for place search.
enum Services {
    private struct OSRM: Decodable {
        struct Route: Decodable {
            struct Geometry: Decodable { let coordinates: [[Double]] }
            struct Leg: Decodable { let steps: [Step] }
            struct Step: Decodable {
                struct Move: Decodable {
                    let type: String
                    let modifier: String?
                    let exit: Int?
                    let location: [Double]
                }
                let maneuver: Move
                let name: String?
                let ref: String?
            }
            let geometry: Geometry
            let distance: Double
            let duration: Double
            let legs: [Leg]
        }
        let code: String
        let routes: [Route]?
    }

    /// `heading`, when moving, makes the route start in the direction of travel (no surprise U-turns on a reroute).
    static func routes(from a: Coord, to b: Coord, heading: Double? = nil) async throws -> [RouteOption] {
        var query = "?alternatives=3&overview=full&geometries=geojson&steps=true"
        if let heading { query += "&bearings=\(Int(heading.rounded()) % 360),60;" }
        let url = URL(string: "https://router.project-osrm.org/route/v1/driving/"
            + "\(a.longitude),\(a.latitude);\(b.longitude),\(b.latitude)" + query)!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ServiceError.badResponse }
        let decoded = try JSONDecoder().decode(OSRM.self, from: data)
        guard decoded.code == "Ok", let routes = decoded.routes, !routes.isEmpty else { throw ServiceError.noRoute }
        return routes.map { r in
            let track = Track(r.geometry.coordinates.map { Coord(latitude: $0[1], longitude: $0[0]) })
            let maneuvers = r.legs.flatMap(\.steps).map { step in
                let loc = step.maneuver.location
                let street = [step.name, step.ref].compactMap { $0 }.first { !$0.isEmpty } ?? ""
                return Maneuver(type: step.maneuver.type, modifier: step.maneuver.modifier, exit: step.maneuver.exit,
                                street: street, along: track.snap(Coord(latitude: loc[1], longitude: loc[0])).along)
            }
            return RouteOption(track: track, distance: r.distance, duration: r.duration, maneuvers: maneuvers)
        }
    }

    private struct Photon: Decodable {
        struct Feature: Decodable {
            struct Geometry: Decodable { let coordinates: [Double] }
            struct Props: Decodable {
                let name, street, housenumber, city, district, locality, country, osm_value: String?
            }
            let geometry: Geometry
            let properties: Props
        }
        let features: [Feature]
    }

    static func search(_ query: String, near: Coord?) async throws -> [Place] {
        var c = URLComponents(string: "https://photon.komoot.io/api/")!
        c.queryItems = [.init(name: "q", value: query), .init(name: "limit", value: "8"), .init(name: "lang", value: "en")]
        if let near {
            c.queryItems! += [.init(name: "lat", value: String(format: "%.4f", near.latitude)),
                              .init(name: "lon", value: String(format: "%.4f", near.longitude))]
        }
        let (data, _) = try await URLSession.shared.data(from: c.url!)
        return try places(from: data)
    }

    /// The nearest named place or address to a point (for a dropped pin).
    static func reverse(_ p: Coord) async throws -> Place? {
        var c = URLComponents(string: "https://photon.komoot.io/reverse")!
        c.queryItems = [.init(name: "lat", value: String(format: "%.6f", p.latitude)),
                        .init(name: "lon", value: String(format: "%.6f", p.longitude)),
                        .init(name: "lang", value: "en"), .init(name: "limit", value: "1")]
        let (data, _) = try await URLSession.shared.data(for: URLRequest(url: c.url!, timeoutInterval: 3))
        return try places(from: data).first
    }

    private static func places(from data: Data) throws -> [Place] {
        let decoded = try JSONDecoder().decode(Photon.self, from: data)
        var seen = Set<String>()
        return decoded.features.compactMap { f in
            let p = f.properties
            let street = [p.housenumber, p.street].compactMap { $0 }.joined(separator: " ")
            let title = p.name ?? (street.isEmpty ? (p.city ?? "Unnamed place") : street)
            let kind = p.osm_value.flatMap { $0 == "yes" ? nil : $0.replacingOccurrences(of: "_", with: " ").capitalized }
            var parts: [String] = []
            for x in [kind, p.name != nil ? street : nil, p.district ?? p.locality, p.city, p.country] {
                if let x, !x.isEmpty, x != title, !parts.contains(x) { parts.append(x) }
            }
            let subtitle = parts.joined(separator: ", ")
            guard seen.insert(title + subtitle).inserted else { return nil }
            return Place(title: title, subtitle: subtitle,
                         coord: Coord(latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0]))
        }
    }
}
