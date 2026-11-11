import Observation
import SwiftUI

/// The weapon and ammo shown under the wanted stars. Tap the gun (or the money, while unarmed)
/// to open the weapon wheel and pick a weapon or unarmed. Each gun keeps its own ammo.
@MainActor @Observable
final class Weapon {
    enum Kind: String, CaseIterable {
        case pistol, shotgun, smg, binoculars
        var name: String {
            switch self {
            case .pistol: "Pistol"; case .shotgun: "Shotgun"
            case .smg: "SMG"; case .binoculars: "Binoculars"
            }
        }
        var group: String {
            switch self {
            case .pistol: "Sidearm"; case .shotgun: "Shotgun"
            case .smg: "Submachine gun"; case .binoculars: "Tool"
            }
        }
        var mag: Int {
            switch self { case .smg: 30; case .pistol: 12; case .shotgun: 6; case .binoculars: 0 }
        }
        /// Binoculars carry no ammo.
        var hasAmmo: Bool { self != .binoculars }
        /// Picture from the icon pack (kept on this Mac only), if it's there.
        var picture: UIImage? { UIImage(named: "icon-\(rawValue).png") }
    }

    /// Things you can wear, switched on and off from the Items side of the wheel.
    enum Item: String, CaseIterable {
        case bandana, cap, sunglasses, outfit
        var name: String {
            switch self { case .bandana: "Bandana"; case .cap: "Racing cap"; case .sunglasses: "Sunglasses"; case .outfit: "Outfit" }
        }
        var group: String {
            switch self { case .bandana: "Face"; case .cap: "Headwear"; case .sunglasses: "Eyewear"; case .outfit: "Wardrobe" }
        }
        var picture: UIImage? { UIImage(named: "icon-\(self == .outfit ? "hanger" : rawValue).png") }
    }
    /// Pills (health) and injectors (special), used from the bottom-left of the wheel.
    private(set) var pills = 2
    private(set) var injectors = 2
    /// When a pill was last taken, so the health bar can flash.
    private(set) var healedAt: Date?
    func takePill() {
        guard pills > 0 else { return }
        pills -= 1
        healedAt = .now
    }
    func useInjector() -> Bool {
        guard injectors > 0 else { return false }
        injectors -= 1
        return true
    }

    /// What you're wearing; the outfit is always on.
    private(set) var wearing: Set<Item> = [.outfit]
    func toggle(_ item: Item) {
        guard item != .outfit else { return }
        if wearing.contains(item) { wearing.remove(item) } else { wearing.insert(item) }
    }

    private(set) var kind = Kind.smg
    /// False while unarmed (money shows instead).
    private(set) var active = true
    private var rounds: [Kind: (clip: Int, ammo: Int)] = [.pistol: (12, 80), .shotgun: (6, 18), .smg: (30, 120), .binoculars: (0, 0)]
    private var reloading = false

    var clip: Int { rounds[kind]!.clip }
    var ammo: Int { rounds[kind]!.ammo }
    func clip(of k: Kind) -> Int { rounds[k]!.clip }
    func ammo(of k: Kind) -> Int { rounds[k]!.ammo }
    var mag: Int { kind.mag }

    /// Pick a gun, or nil for unarmed.
    func select(_ k: Kind?) {
        guard let k else { active = false; return }
        kind = k
        active = true
    }

    func fire() {
        guard active, kind.hasAmmo, !reloading, clip > 0 else { return }
        rounds[kind]!.clip -= 1
        if clip == 0 { schedule(after: ammo > 0 ? 1.2 : 4) }
    }

    private func schedule(after seconds: Double) {
        reloading = true
        let k = kind
        Task {
            try? await Task.sleep(for: .seconds(seconds))
            if rounds[k]!.ammo == 0 { rounds[k]!.ammo = k.mag * 7 }
            reload(k)
            reloading = false
        }
    }

    private func reload(_ k: Kind) {
        let take = min(k.mag - rounds[k]!.clip, rounds[k]!.ammo)
        rounds[k]!.clip += take
        rounds[k]!.ammo -= take
    }
}

/// Clip and reserve counts over the gun icon.
struct WeaponHUD: View {
    let weapon: Weapon
    var onTap: () -> Void = {}
    static let gunWidth: CGFloat = 72
    static var height: CGFloat { 18 + 1 + gunWidth * 44 / 128 }

    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            HStack(spacing: 10) {
                number(weapon.clip, color: weapon.clip == 0 ? Color(red: 0.88, green: 0.31, blue: 0.31) : .white)
                number(weapon.ammo, color: Color(white: 0.64))
            }
            .opacity(weapon.active && weapon.kind.hasAmmo ? 1 : 0)
            Group {
                if !weapon.active {
                    if let fist = UIImage(named: "fist.png") { Image(uiImage: fist).resizable().scaledToFit() }
                } else if let picture = weapon.kind.picture {
                    Image(uiImage: picture).resizable().scaledToFit()
                } else {
                    Color.clear
                }
            }
            .frame(width: Self.gunWidth, height: Self.gunWidth * 44 / 128, alignment: .trailing)
            .shadow(color: .black.opacity(0.45), radius: 1.5, y: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .accessibilityElement()
        .accessibilityLabel(weapon.active ? weapon.kind.name : "Unarmed")
        .accessibilityHint("Opens the weapon wheel")
        .accessibilityAddTraits(.isButton)
        .accessibilityValue("\(weapon.clip) in the clip, \(weapon.ammo) spare")
    }

    private func number(_ n: Int, color: Color) -> some View {
        Text("\(n)")
            .font(HUDFont.font(size: 18))
            .foregroundStyle(color)
            .shadow(color: .black.opacity(0.55), radius: 1.5, y: 0.6)
    }
}
