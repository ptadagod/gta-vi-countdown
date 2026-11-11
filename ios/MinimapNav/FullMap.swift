import MapLibre
import SwiftUI
import UIKit

/// Full-screen map opened by tapping the minimap. Pan and zoom freely; touch and hold
/// anywhere to drop a waypoint there.
struct FullMapScreen: View {
    let nav: Navigator
    let wanted: WantedLevel
    let carLink: CarLink
    let money: Money
    @Environment(\.dismiss) private var dismiss
    @State private var showSearch = false
    @State private var recenter = 0
    @State private var dropping = false

    var body: some View {
        ZStack {
            FullMap(nav: nav, recenter: recenter, onDrop: drop)
                .ignoresSafeArea()

            VStack {
                HStack(alignment: .top) {
                    roundButton("xmark", label: "Close map") { dismiss() }
                    Spacer()
                    Text(dropping ? "Setting waypoint…" : "Touch and hold to set a waypoint")
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(.black.opacity(0.6), in: Capsule())
                        .foregroundStyle(.white)
                    Spacer()
                    roundButton("magnifyingglass", label: "Search places") { showSearch = true }
                }
                Spacer()
                HStack(alignment: .bottom) {
                    if let dest = nav.destination {
                        destinationCard(dest)
                    }
                    Spacer()
                    roundButton("location.fill", label: "Center on me") { recenter += 1 }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .sheet(isPresented: $showSearch) {
            SearchSheet(nav: nav, wanted: wanted, carLink: carLink, money: money)
                .presentationDetents([.medium, .large])
        }
    }

    private func destinationCard(_ dest: Place) -> some View {
        HStack(spacing: 12) {
            Circle().fill(Color(MinimapHUDView.pink)).frame(width: 12, height: 12)
                .overlay(Circle().stroke(.white, lineWidth: 2))
            VStack(alignment: .leading, spacing: 1) {
                Text(dest.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                if let r = nav.activeRoute {
                    Text("\(MinimapHUDView.format(r.distance)) · \(Int((r.duration / 60).rounded())) min")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                } else if nav.isRouting {
                    Text("Finding route…").font(.system(size: 13)).foregroundStyle(.secondary)
                }
            }
            Button("Go") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(Color(MinimapHUDView.pink))
            Button {
                nav.clearDestination("Waypoint cleared")
            } label: {
                Image(systemName: "trash")
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Clear waypoint")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.regularMaterial, in: .rect(cornerRadius: 16, style: .continuous))
        .frame(maxWidth: 420, alignment: .leading)
    }

    private func roundButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 42, height: 42)
                .background(.regularMaterial, in: Circle())
        }
        .tint(.primary)
        .accessibilityLabel(label)
    }

    private func drop(_ coord: Coord) {
        dropping = true
        Task {
            // Name the spot if we can (quickly), otherwise call it a dropped pin.
            let found = try? await Services.reverse(coord)
            let place = Place(title: found?.title ?? "Dropped pin",
                              subtitle: found?.subtitle ?? String(format: "%.5f, %.5f", coord.latitude, coord.longitude),
                              coord: coord)
            nav.setDestination(place)
            dropping = false
        }
    }
}

/// The interactive map itself, in the same style as the minimap, viewed from above.
struct FullMap: UIViewRepresentable {
    let nav: Navigator
    let recenter: Int
    let onDrop: (Coord) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MLNMapView {
        let map = MLNMapView(frame: .zero, styleURL: Bundle.main.url(forResource: "minimap-style", withExtension: "json"))
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.tintColor = MinimapHUDView.pink
        map.logoView.isHidden = true
        map.attributionButtonPosition = .bottomRight
        map.isPitchEnabled = false
        if let p = nav.position {
            map.setCenter(p, zoomLevel: 15, animated: false)
        }
        let hold = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.hold(_:)))
        hold.minimumPressDuration = 0.45
        map.addGestureRecognizer(hold)
        context.coordinator.map = map
        context.coordinator.onDrop = onDrop
        context.coordinator.recentered = recenter
        return map
    }

    func updateUIView(_ map: MLNMapView, context: Context) {
        let c = context.coordinator
        c.onDrop = onDrop
        // Reading these here makes the map redraw when the route or waypoint changes.
        c.routes = (nav.routes, nav.active)
        c.destination = nav.destination?.coord
        c.redraw()
        if recenter != c.recentered, let p = nav.position {
            c.recentered = recenter
            map.setCenter(p, zoomLevel: max(map.zoomLevel, 15), direction: 0, animated: true)
        }
    }

    final class Coordinator: NSObject, MLNMapViewDelegate {
        weak var map: MLNMapView?
        var onDrop: ((Coord) -> Void)?
        var recentered = 0
        var routes: ([RouteOption], Int) = ([], 0)
        var destination: Coord?
        private var ready = false

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            ready = true
            if let src = style.source(withIdentifier: "full-dest") { _ = src } else {
                let source = MLNShapeSource(identifier: "full-dest", shape: nil)
                style.addSource(source)
                let ring = MLNCircleStyleLayer(identifier: "full-dest", source: source)
                ring.circleRadius = NSExpression(forConstantValue: 8)
                ring.circleColor = NSExpression(forConstantValue: MinimapHUDView.pink)
                ring.circleStrokeColor = NSExpression(forConstantValue: UIColor.white)
                ring.circleStrokeWidth = NSExpression(forConstantValue: 3)
                style.addLayer(ring)
            }
            redraw()
        }

        func redraw() {
            guard ready, let style = map?.style else { return }
            let (all, active) = routes
            if let route = style.source(withIdentifier: "route") as? MLNShapeSource {
                if all.indices.contains(active) {
                    var c = all[active].track.coords
                    route.shape = MLNPolylineFeature(coordinates: &c, count: UInt(c.count))
                } else {
                    route.shape = MLNShapeCollectionFeature(shapes: [])
                }
            }
            if let alts = style.source(withIdentifier: "alts") as? MLNShapeSource {
                alts.shape = MLNShapeCollectionFeature(shapes: all.enumerated().compactMap { i, r in
                    guard i != active else { return nil }
                    var c = r.track.coords
                    return MLNPolylineFeature(coordinates: &c, count: UInt(c.count))
                })
            }
            if let dest = style.source(withIdentifier: "full-dest") as? MLNShapeSource {
                if let d = destination {
                    let point = MLNPointFeature()
                    point.coordinate = d
                    dest.shape = point
                } else {
                    dest.shape = nil
                }
            }
        }

        @objc func hold(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began, let map else { return }
            let coord = map.convert(g.location(in: map), toCoordinateFrom: map)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            destination = coord
            redraw()
            onDrop?(coord)
        }
    }
}
