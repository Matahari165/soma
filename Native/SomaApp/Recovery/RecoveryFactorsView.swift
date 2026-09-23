import SomaCore
import SwiftUI

struct RecoveryFactorsView: View {
    let response: NativeRecoveryResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Composantes du calcul")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            factor("HRV", component: response.score.components.hrv)
            factor("Fréquence cardiaque au repos", component: response.score.components.restingHeartRate)
            factor("Sommeil", component: response.score.components.sleep)
        }
    }

    private func factor(_ label: String, component: RecoveryScoreComponent) -> some View {
        LabeledContent(label) {
            VStack(alignment: .trailing, spacing: 4) {
                Text(component.value.map { "\($0.formatted(.number.precision(.fractionLength(0)))) / 100" } ?? "Indisponible")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(component.value == nil ? SomaTheme.secondary : SomaTheme.primary)
                Text("Poids \(component.weight, format: .percent.precision(.fractionLength(0)))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
