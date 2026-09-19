import Charts
import SomaCore
import SwiftUI

struct AnalysisEffectsChart: View {
    let relations: [MatrixRelation]
    let outcomes: [MatrixOutcome]
    @Binding var selectedLabel: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Relations prioritaires").font(.title2)
                Spacer()
                Text("force / seuil").font(.caption.monospaced()).foregroundStyle(SomaTheme.secondary)
            }
            Chart(relations) { relation in
                if let strength = relation.practicalRatio {
                    PointMark(x: .value("Relation", label(for: relation)), y: .value("Seuil pratique", strength))
                        .foregroundStyle(style(for: relation))
                        .symbolSize(relation.id == selectedID ? 120 : 70)
                }
            }
            .chartXSelection(value: $selectedLabel)
            .chartXAxis { AxisMarks { AxisValueLabel(orientation: .verticalReversed) } }
            .chartYAxis { AxisMarks(position: .leading) }
            .frame(minHeight: 260, idealHeight: 320)
            .accessibilityLabel("Graphique interactif des relations prioritaires")
            .accessibilityValue("\(relations.count) relations. Sélectionnez une relation pour ouvrir son détail.")
            Text("Force relative au seuil pratique canonique du serveur · 1 = seuil atteint. Effet et IC restent affichés dans leur unité dans le détail.")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private var selectedID: String? { relations.first(where: { label(for: $0) == selectedLabel })?.id }
    private func label(for relation: MatrixRelation) -> String { "\(relation.predictorLabel ?? relation.predictorId) → \(relation.outcomeLabel ?? relation.outcomeId)" }
    private func style(for relation: MatrixRelation) -> Color {
        guard let effect = relation.effect, let direction = outcomes.first(where: { $0.id == relation.outcomeId })?.direction else { return SomaTheme.secondary }
        if direction == "target" { return SomaTheme.primary }
        return ((direction == "higher") == (effect > 0)) ? SomaTheme.signal : SomaTheme.warning
    }
}
