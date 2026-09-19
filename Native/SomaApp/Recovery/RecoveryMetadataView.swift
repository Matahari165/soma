import SomaCore
import SwiftUI

struct RecoveryMetadataView: View {
    let response: NativeRecoveryResponse
    let isRefreshing: Bool
    let refresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledContent("Dernière mesure") {
                Text(response.latestDate ?? "Indisponible")
                    .font(.body.monospacedDigit())
            }
            LabeledContent("Fraîcheur") {
                Label(freshnessLabel, systemImage: freshnessIcon)
                    .foregroundStyle(freshnessColor)
            }
            LabeledContent("Couverture du calcul") {
                Text(response.score.coverage, format: .percent.precision(.fractionLength(0)))
                    .font(.body.monospacedDigit())
            }
            LabeledContent("Mesures") {
                Text(response.provenance.measurements.label)
            }
            LabeledContent("Score") {
                Text(response.provenance.score.label)
            }
            Button("Actualiser les données", systemImage: "arrow.clockwise", action: refresh)
                .buttonStyle(.plain)
                .disabled(isRefreshing)
                .frame(minHeight: 44)
                .accessibilityValue(isRefreshing ? "Actualisation en cours" : "")
        }
        .accessibilityElement(children: .contain)
    }

    private var freshnessLabel: String {
        switch response.freshness.state {
        case .current: "À jour"
        case .partial: "Partielle"
        case .stale: "Ancienne"
        case .missing: "Indisponible"
        }
    }

    private var freshnessIcon: String {
        switch response.freshness.state {
        case .current: "checkmark"
        case .partial: "circle.lefthalf.filled"
        case .stale: "clock"
        case .missing: "minus"
        }
    }

    private var freshnessColor: Color {
        switch response.freshness.state {
        case .current: SomaTheme.signal
        case .partial, .stale: SomaTheme.warning
        case .missing: SomaTheme.secondary
        }
    }
}
