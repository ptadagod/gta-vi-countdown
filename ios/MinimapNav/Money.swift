import Observation
import SwiftUI

/// Bank balance and cash, kept between launches. Cash goes up $1 for every 25 m you travel.
@MainActor @Observable
final class Money {
    private(set) var bank: Int
    private(set) var cash: Int
    /// Progress (0...1) toward the next $100 of cash, for the wallet ring.
    var cashProgress: Double { Double(cash % 100) / 100 }
    /// Bank ring: how far the bank is toward the next $10,000.
    var bankProgress: Double { Double(bank % 10_000) / 10_000 }

    @ObservationIgnored private var last: Coord?
    @ObservationIgnored private var carried = 0.0
    private static let bankKey = "money.bank", cashKey = "money.cash"
    private static let metresPerDollar = 25.0

    init() {
        let d = UserDefaults.standard
        bank = d.object(forKey: Self.bankKey) as? Int ?? 15_150
        cash = d.object(forKey: Self.cashKey) as? Int ?? 3_146
    }

    func set(bank: Int? = nil, cash: Int? = nil) {
        if let bank { self.bank = max(0, bank); UserDefaults.standard.set(self.bank, forKey: Self.bankKey) }
        if let cash { self.cash = max(0, cash); UserDefaults.standard.set(self.cash, forKey: Self.cashKey) }
    }

    func track(_ position: Coord?) {
        guard let position else { return }
        defer { last = position }
        guard let last else { return }
        let d = Geo.distance(last, position)
        guard d < 500 else { return } // ignore GPS jumps
        carried += d
        let earned = Int(carried / Self.metresPerDollar)
        if earned > 0 {
            carried -= Double(earned) * Self.metresPerDollar
            cash += earned
            UserDefaults.standard.set(cash, forKey: Self.cashKey)
        }
    }
}

/// Top-right money display: bank (purple) over cash (green), each with a ringed icon.
struct MoneyHUD: View {
    static let row: CGFloat = 20
    static var height: CGFloat { row * 2 + 4 }
    let money: Money

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            line(money.bank, icon: "bitcoinsign", color: Color(red: 0.72, green: 0.48, blue: 1), progress: money.bankProgress)
            line(money.cash, icon: "wallet.bifold.fill", color: Color(red: 0.55, green: 0.88, blue: 0.5), progress: money.cashProgress)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Bank \(Self.dollars(money.bank)), cash \(Self.dollars(money.cash))")
    }

    private func line(_ amount: Int, icon: String, color: Color, progress: Double) -> some View {
        HStack(spacing: 6) {
            Text(Self.dollars(amount))
                .font(.system(size: 17, weight: .heavy).width(.condensed).monospacedDigit())
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.8), radius: 0, x: 1, y: 1)
                .shadow(color: .black.opacity(0.5), radius: 3)
                .contentTransition(.numericText())
                .animation(.easeOut(duration: 0.3), value: amount)
            RingIcon(icon: icon, color: color, progress: progress)
                .frame(width: Self.row, height: Self.row)
        }
        .frame(height: Self.row)
    }

    static func dollars(_ n: Int) -> String { "$" + n.formatted(.number.grouping(.automatic)) }
}

/// Dark round badge with a coloured icon and a progress ring around it.
private struct RingIcon: View {
    let icon: String
    let color: Color
    let progress: Double

    var body: some View {
        ZStack {
            Circle().fill(Color(white: 0.17))
            Circle().stroke(Color(white: 0.09), lineWidth: 2.2).padding(1.6)
            Circle()
                .trim(from: 0, to: max(0.02, progress))
                .stroke(color, style: StrokeStyle(lineWidth: 2.2, lineCap: .butt))
                .rotationEffect(.degrees(-90))
                .padding(1.6)
            Image(systemName: icon)
                .font(.system(size: 8.5, weight: .black))
                .foregroundStyle(color)
        }
        .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
    }
}

/// Edit the bank and cash amounts.
struct MoneySection: View {
    let money: Money

    var body: some View {
        Section {
            field("Bank", icon: "bitcoinsign", value: money.bank) { money.set(bank: $0) }
            field("Cash", icon: "wallet.bifold.fill", value: money.cash) { money.set(cash: $0) }
        } header: {
            Text("Money")
        } footer: {
            Text("Cash also goes up $1 for every 25 m you travel.")
        }
    }

    private func field(_ title: String, icon: String, value: Int, set: @escaping (Int) -> Void) -> some View {
        LabeledContent {
            TextField(title, value: Binding(get: { value }, set: set), format: .currency(code: "USD").precision(.fractionLength(0)))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
        } label: {
            Label(title, systemImage: icon)
        }
    }
}
