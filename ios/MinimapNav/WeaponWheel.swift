import SwiftUI

/// Weapon wheel: blurs the camera and lays eight rectangular slots out around the centre
/// (top, the four diagonals, left, right and bottom), with Weapons and Items tabs above.
/// Weapons: tap to equip. Items: tap to switch on or off. Tap the selected slot again, or
/// anywhere outside, to close. Keyboard: arrows move, Return picks, Tab switches side, Esc closes.
struct WeaponWheel: View {
    let weapon: Weapon
    let close: () -> Void

    private enum Tab { case weapons, items }
    /// What a slot holds.
    private enum Slot: Hashable {
        case gun(Weapon.Kind), unarmed, item(Weapon.Item), empty
    }

    /// Clockwise from the top: top, upper-right, right, lower-right, bottom, lower-left, left, upper-left.
    private let weaponSlots: [Slot] = [.gun(.pistol), .gun(.smg), .unarmed, .gun(.binoculars),
                                       .empty, .empty, .gun(.shotgun), .empty]
    private let itemSlots: [Slot] = [.item(.bandana), .empty, .item(.cap), .item(.outfit),
                                     .empty, .empty, .item(.sunglasses), .empty]
    /// Where each slot sits, relative to the centre (an octagon, a little wider than tall).
    private let offsets: [CGSize] = [
        .init(width: 0, height: -128), .init(width: 110, height: -80), .init(width: 138, height: 0),
        .init(width: 110, height: 80), .init(width: 0, height: 128), .init(width: -110, height: 80),
        .init(width: -138, height: 0), .init(width: -110, height: -80),
    ]

    @State private var tab = Tab.weapons
    @State private var focused = 0
    @State private var shown = false
    @FocusState private var keyboard: Bool

    private let tileW: CGFloat = 92
    private let tileH: CGFloat = 64
    private let stripH: CGFloat = 17
    private let teal = Color(red: 0.12, green: 0.86, blue: 0.72)
    private let pink = Color(red: 0.98, green: 0.55, blue: 0.75)

    private var slots: [Slot] { tab == .weapons ? weaponSlots : itemSlots }

    var body: some View {
        ZStack {
            // Strong blur of the camera with a dark tint.
            Rectangle().fill(.ultraThinMaterial)
                .overlay(Color.black.opacity(0.4))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: dismiss)

            centerLabel

            ForEach(slots.indices, id: \.self) { i in
                tileView(i)
                    .offset(offsets[i])
            }

            tabs.offset(y: -128 - tileH / 2 - 24)
        }
        .scaleEffect(shown ? 1 : 0.94)
        .opacity(shown ? 1 : 0)
        .focusable()
        .focused($keyboard)
        .focusEffectDisabled()
        .onKeyPress(.rightArrow) { move(1); return .handled }
        .onKeyPress(.downArrow) { move(1); return .handled }
        .onKeyPress(.leftArrow) { move(-1); return .handled }
        .onKeyPress(.upArrow) { move(-1); return .handled }
        .onKeyPress(.tab) { switchTab(tab == .weapons ? .items : .weapons); return .handled }
        .onKeyPress(.return) { pick(focused); if tab == .weapons { dismiss() }; return .handled }
        .onKeyPress(.escape) { dismiss(); return .handled }
        .onAppear {
            focused = weaponSlots.firstIndex(of: current) ?? 0
            keyboard = true
            withAnimation(.easeOut(duration: 0.18)) { shown = true }
        }
        .accessibilityAddTraits(.isModal)
    }

    private var current: Slot { weapon.active ? .gun(weapon.kind) : .unarmed }

    private var tabs: some View {
        HStack(spacing: 4) {
            tabButton("Weapons", .weapons)
            tabButton("Items", .items)
        }
    }

    private func tabButton(_ title: String, _ t: Tab) -> some View {
        let on = tab == t
        return Text(title.uppercased())
            .font(.system(size: 13, weight: .heavy).width(.condensed))
            .foregroundStyle(on ? .black : .white)
            .padding(.horizontal, 9)
            .frame(height: 22)
            .background(on ? Color.white : Color(white: 0.12).opacity(0.75))
            .contentShape(Rectangle())
            .onTapGesture { switchTab(t) }
            .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private func switchTab(_ t: Tab) {
        guard t != tab else { return }
        withAnimation(.easeOut(duration: 0.15)) {
            tab = t
            focused = t == .weapons ? (weaponSlots.firstIndex(of: current) ?? 0) : 2
        }
    }

    private func move(_ step: Int) {
        withAnimation(.easeOut(duration: 0.15)) { focused = (focused + step + slots.count) % slots.count }
    }

    /// Select a slot: guns and unarmed are equipped at once; items switch on or off.
    private func pick(_ i: Int) {
        withAnimation(.easeOut(duration: 0.15)) { focused = i }
        switch slots[i] {
        case .gun(let k): weapon.select(k)
        case .unarmed: weapon.select(nil)
        case .item(let item): weapon.toggle(item)
        case .empty: break
        }
    }

    private var centerLabel: some View {
        let (title, sub): (String, String) = switch slots[focused] {
        case .gun(let k): (k.name, k.group)
        case .unarmed: ("Unarmed", "Sidearm")
        case .item(let item): (item.name, item.group)
        case .empty: ("Empty", "")
        }
        return VStack(spacing: 1) {
            Text(title.uppercased())
                .font(.system(size: 19, weight: .heavy).width(.condensed))
                .foregroundStyle(.white)
            Text(sub.uppercased())
                .font(.system(size: 13, weight: .bold).width(.condensed))
                .foregroundStyle(.white.opacity(0.65))
        }
        .multilineTextAlignment(.center)
        .shadow(color: .black.opacity(0.5), radius: 3)
        .contentTransition(.opacity)
    }

    /// The text strip along the bottom of a slot: ammo for guns, ON/OFF for items.
    private func strip(_ slot: Slot) -> AnyView? {
        switch slot {
        case .gun(let k) where k.hasAmmo:
            return AnyView(HStack(spacing: 4) {
                Text("\(weapon.clip(of: k))").foregroundStyle(.white)
                Text("\(weapon.ammo(of: k))").foregroundStyle(Color(white: 0.75))
            }.font(HUDFont.font(size: 13)))
        case .item(let item) where item != .outfit:
            return AnyView(Text(weapon.wearing.contains(item) ? "ON" : "OFF")
                .font(.system(size: 13, weight: .heavy).width(.condensed))
                .foregroundStyle(.white))
        default:
            return nil
        }
    }

    private func tileView(_ i: Int) -> some View {
        let slot = slots[i]
        let selected = i == focused
        let equipped = tab == .weapons && slot == current
        let text = strip(slot)
        let hasStrip = text != nil
        // Every slot is the same fixed rectangle; the strip sits inside it.
        return ZStack(alignment: .bottom) {
            Rectangle().fill(Color.white.opacity(selected ? 0.42 : slot == .empty ? 0.1 : 0.18))
            // The equipped weapon glows softly: unarmed from the top edge, guns from above their strip.
            if equipped {
                Ellipse()
                    .fill(RadialGradient(colors: [(slot == .unarmed ? pink : teal).opacity(0.9), .clear],
                                         center: .center, startRadius: 0, endRadius: tileW * 0.5))
                    .frame(width: tileW * 1.1, height: tileH * 0.5)
                    .offset(y: slot == .unarmed ? -tileH * 0.78 : -(hasStrip ? stripH : 0) + tileH * 0.22)
            }
            icon(slot)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.bottom, hasStrip ? stripH : 0)

            if let text {
                text
                    .frame(maxWidth: .infinity)
                    .frame(height: stripH)
                    .background(Color(white: 0.14).opacity(0.9))
            }
            // The outfit you have on gets a tick in the corner.
            if slot == .item(.outfit) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 14))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.black, .white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(4)
            }
        }
        .frame(width: tileW, height: tileH)
        .clipped()
        .overlay(Rectangle().stroke(selected ? .white : Color(white: 0.75).opacity(0.35),
                                    lineWidth: selected ? 2.5 : 0.75))
        .contentShape(Rectangle())
        .onTapGesture {
            // Weapons close on a second tap; items just keep switching on and off.
            if selected, tab == .weapons { pick(i); dismiss() } else { pick(i) }
        }
        .animation(.easeOut(duration: 0.15), value: selected)
        .accessibilityElement()
        .accessibilityLabel(label(slot))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    @ViewBuilder private func icon(_ slot: Slot) -> some View {
        switch slot {
        case .gun(let k):
            if let picture = k.picture {
                Image(uiImage: picture).resizable().scaledToFit()
                    .frame(width: k == .pistol ? 46 : 74, height: 36)
            }
        case .unarmed:
            if let fist = UIImage(named: "fist.png") {
                Image(uiImage: fist).resizable().scaledToFit().frame(width: 50, height: 38)
            }
        case .item(let item):
            if let picture = item.picture {
                Image(uiImage: picture).resizable().scaledToFit()
                    .frame(width: 52, height: 34)
            }
        case .empty:
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    private func label(_ slot: Slot) -> String {
        switch slot {
        case .gun(let k) where k.hasAmmo: "\(k.name), \(weapon.clip(of: k)) in the clip, \(weapon.ammo(of: k)) spare"
        case .gun(let k): k.name
        case .unarmed: "Unarmed"
        case .item(let item): "\(item.name), \(weapon.wearing.contains(item) ? "on" : "off")"
        case .empty: "Empty slot"
        }
    }

    private func dismiss() {
        withAnimation(.easeIn(duration: 0.15)) { shown = false }
        Task {
            try? await Task.sleep(for: .seconds(0.15))
            close()
        }
    }
}

/// Pills and injectors, shown in the bottom-left corner while the wheel is open. Tap one to use it.
struct ConsumablesView: View {
    let weapon: Weapon
    let special: SpecialAbility

    var body: some View {
        HStack(spacing: 8) {
            card(picture: "icon-pills.png", count: weapon.pills, badge: "heart.fill",
                 color: Color(red: 0.93, green: 0.72, blue: 0.80), name: "Pills") { weapon.takePill() }
            card(picture: "icon-injector.png", count: weapon.injectors, badge: "eye.fill",
                 color: Color(red: 0.67, green: 0.58, blue: 0.98), name: "Injector") {
                if weapon.useInjector() { special.refill() }
            }
        }
    }

    private func card(picture: String, count: Int, badge: String, color: Color, name: String,
                      use: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            ZStack {
                Rectangle().fill(Color.white.opacity(0.18))
                if let image = UIImage(named: picture) {
                    Image(uiImage: image).resizable().scaledToFit().frame(height: 34)
                }
            }
            .frame(width: 64, height: 44)
            HStack(spacing: 4) {
                Text("\(count)").font(HUDFont.font(size: 13)).foregroundStyle(.white)
                ZStack {
                    Circle().fill(Color(white: 0.2))
                    Image(systemName: badge).font(.system(size: 7, weight: .bold)).foregroundStyle(color)
                }
                .frame(width: 13, height: 13)
            }
            .frame(width: 64, height: 17)
            .background(Color(white: 0.14).opacity(0.9))
        }
        .overlay(Rectangle().stroke(Color(white: 0.75).opacity(0.35), lineWidth: 0.75))
        .opacity(count > 0 ? 1 : 0.45)
        .contentShape(Rectangle())
        .onTapGesture(perform: use)
        .accessibilityElement()
        .accessibilityLabel("\(name), \(count) left")
        .accessibilityAddTraits(.isButton)
    }
}
