import SomaCore
import SwiftUI

struct AnalysisRelationList: View {
    let relations: [MatrixRelation]
    let outcomes: [MatrixOutcome]
    @Binding var selectedRelationID: String?

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(relations) { relation in
                Button { selectedRelationID = relation.id } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(relation.predictorLabel ?? relation.predictorId) → \(relation.outcomeLabel ?? relation.outcomeId)")
                                .font(.headline).multilineTextAlignment(.leading)
                            Spacer()
                            Text(effectLabel(relation)).font(.body.monospacedDigit()).foregroundStyle(directionColor(relation))
                        }
                        HStack(spacing: 12) {
                            Text(lagLabel(relation.lagDays))
                            Text("n = \(relation.sampleSize)")
                            Text(periodLabel(relation.period))
                            if relation.stable == true { Text("stable") }
                            Text(directionLabel(relation))
                        }
                        .font(.caption.monospacedDigit()).foregroundStyle(SomaTheme.secondary)
                    }
                    .padding(.vertical, 14).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Ouvre la preuve statistique de cette relation")
                Divider().overlay(SomaTheme.rule)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func effectLabel(_ relation: MatrixRelation) -> String {
        guard let effect = relation.effect else { return "Non calculable" }
        return "\(effect.formatted(.number.precision(.fractionLength(1)))) \(relation.outcomeUnit ?? "")"
    }
    private func directionColor(_ relation: MatrixRelation) -> Color {
        guard let effect = relation.effect, let direction = outcomes.first(where: { $0.id == relation.outcomeId })?.direction, direction != "target" else { return SomaTheme.primary }
        return ((direction == "higher") == (effect > 0)) ? SomaTheme.signal : SomaTheme.warning
    }
    private func directionLabel(_ relation: MatrixRelation) -> String {
        guard let effect = relation.effect, let direction = outcomes.first(where: { $0.id == relation.outcomeId })?.direction else { return "sens indisponible" }
        if direction == "target" { return relation.modelType == "optimal-zone" ? "zone favorable" : "cible personnelle" }
        return ((direction == "higher") == (effect > 0)) ? "favorable" : "défavorable"
    }
}

func lagLabel(_ lag: Int?) -> String {
    switch lag { case 0: "même jour"; case 1: "lendemain"; case 2: "deux jours après"; default: "décalage inconnu" }
}

func periodLabel(_ period: AnalysisPeriod?) -> String {
    switch period { case .days(let days): "\(days) jours"; case .all: "tout l’historique"; default: "période inconnue" }
}
