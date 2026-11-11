import Observation
import SwiftUI

/// Special ability meter. Charges while you drive (full after about 2 km), and when it's
/// full you can tap the bar to use it: the screen takes on a purple tint while the meter drains.
@MainActor @Observable
final class SpecialAbility {
    private(set) var level = 0.6 // 0...1
    private(set) var active = false

    static let chargeDistance = 2_000.0 // metres of driving to fill
    static let duration = 15.0          // seconds it lasts

    var isFull: Bool { level >= 0.999 }

    func tick(dt: Double, speed: Double) {
        if active {
            level = max(0, level - dt / Self.duration)
            if level == 0 { active = false }
        } else if speed > 3 {
            level = min(1, level + speed * dt / Self.chargeDistance)
        }
    }

    func activate() {
        guard isFull, !active else { return }
        active = true
    }
}

/// The lavender bar under the health bar.
struct SpecialBar: View {
    let ability: SpecialAbility

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.05)) { t in
            // Glows softly when full (ready to use) and while in use.
            let pulse = ability.isFull || ability.active
                ? 0.5 + 0.5 * sin(t.date.timeIntervalSinceReferenceDate * 2 * .pi / 1.2) : 0
            StatBar(icon: "eye.fill", color: Color(red: 0.67, green: 0.58, blue: 0.98),
                    level: ability.level, glow: pulse * 0.9)
        }
        .animation(.linear(duration: 1), value: ability.level)
        .contentShape(Rectangle().inset(by: -8))
        .onTapGesture { ability.activate() }
        .accessibilityElement()
        .accessibilityLabel("Special ability")
        .accessibilityValue("\(Int(ability.level * 100)) percent\(ability.isFull ? ", ready" : "")")
        .accessibilityAddTraits(ability.isFull ? .isButton : [])
    }
}

/// Purple wash over the camera while the special ability is in use.
struct SpecialTint: View {
    let ability: SpecialAbility
    var body: some View {
        Color(red: 0.55, green: 0.2, blue: 1)
            .opacity(ability.active ? SpecialTint.alpha : 0)
            .animation(.easeInOut(duration: 0.6), value: ability.active)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
    static let alpha = 0.2
}
