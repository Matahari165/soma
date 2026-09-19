import SomaCore
import SwiftUI

struct RecoverySignalReferenceView: View {
    let title: String
    let signal: RecoverySignal
    let higherIsBetter: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.headline)
                Spacer(minLength: 16)
                Text(valueLabel)
                    .font(.title2.monospacedDigit())
                    .foregroundStyle(signal.current == nil ? SomaTheme.secondary : SomaTheme.primary)
            }
            Text(referenceLabel)
                .font(.body)
                .foregroundStyle(SomaTheme.secondary)
            Text(higherIsBetter ? "Une valeur plus élevée que votre référence soutient le score." : "Une valeur plus basse que votre référence soutient le score.")
                .font(.body)
                .foregroundStyle(SomaTheme.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private var valueLabel: String {
        guard let value = signal.current else { return "Indisponible" }
        return "\(value.formatted(.number.precision(.fractionLength(0)))) \(signal.unit)"
    }

    private var referenceLabel: String {
        guard let reference = signal.reference else {
            return "Référence personnelle indisponible · n=\(signal.measuredDays)"
        }
        return "Référence personnelle · \(reference.formatted(.number.precision(.fractionLength(0)))) \(signal.unit) · n=\(signal.measuredDays)"
    }
}
