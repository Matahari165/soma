import SomaCore
import SwiftUI

struct AnalysisRelationDetail: View {
    let relation: MatrixRelation
    let outcome: MatrixOutcome?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Détail de la relation").font(.title2).accessibilityAddTraits(.isHeader)
            Text(relation.comparisonLabel ?? "Comparaison non calculable").font(.headline)
            Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 10) {
                row("Effet", effectText)
                row("Intervalle à 95 %", intervalText)
                row("Échantillon", "\(relation.sampleSize) paires")
                row("Période", periodLabel(relation.period))
                row("Décalage", lagLabel(relation.lagDays))
                row("Correction multiple", qText)
                row("Robustesse", robustnessText)
                row("Forme", shapeText)
                row("Couverture", coverageText)
                row("Provenance", provenanceText)
            }
            Text("Cette association décrit des jours comparables chez une même personne. Elle ne prouve pas que le facteur a causé le résultat.")
                .font(.body).foregroundStyle(SomaTheme.secondary)
        }
        .padding(16)
        .background(Color.white.opacity(0.035))
        .clipShape(.rect(cornerRadius: 4))
        .accessibilityElement(children: .contain)
    }

    private func row(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(SomaTheme.secondary)
            Text(value).font(.body.monospacedDigit()).fixedSize(horizontal: false, vertical: true).gridColumnAlignment(.leading)
        }
    }
    private var effectText: String {
        guard let effect = relation.effect else { return relation.evidence == "insufficient" ? "Insuffisant" : "Non calculable" }
        let percent = relation.percentEffect.map { " (\($0.formatted(.number.precision(.fractionLength(1)))) %)" } ?? ""
        return "\(effect.formatted(.number.precision(.fractionLength(1)))) \(relation.outcomeUnit ?? outcome?.unit ?? "")\(percent)"
    }
    private var intervalText: String {
        guard let low = relation.effectConfidenceLow, let high = relation.effectConfidenceHigh else { return "Indisponible" }
        return "\(low.formatted(.number.precision(.fractionLength(1)))) à \(high.formatted(.number.precision(.fractionLength(1)))) \(relation.outcomeUnit ?? outcome?.unit ?? "")"
    }
    private var qText: String { relation.qValue.map { "BH q = \($0.formatted(.number.precision(.fractionLength(3))))" } ?? "Indisponible" }
    private var robustnessText: String {
        guard relation.stable == true, let blocks = relation.stability?.chronologicalBlocks else { return "Non robuste" }
        return "Robuste · direction retrouvée dans \(blocks) blocs"
    }
    private var shapeText: String {
        switch relation.modelType {
        case "threshold": "Seuil · \(relation.comparisonLabel ?? "")"
        case "plateau": "Plateau · \(relation.comparisonLabel ?? "")"
        case "optimal-zone": "Zone favorable · \(relation.comparisonLabel ?? "")"
        case "adverse-zone": "Zone défavorable · \(relation.comparisonLabel ?? "")"
        case "middle-zone": "Zone intermédiaire · \(relation.comparisonLabel ?? "")"
        case "binary": "Comparaison oui / non"
        case "linear": relation.nonlinearTested == true ? "Progression graduelle · formes non linéaires testées" : "Progression graduelle"
        default: "Indisponible"
        }
    }
    private var coverageText: String {
        let items = relation.coverageBySource ?? []
        return items.isEmpty ? "Indisponible" : items.map { "\($0.source): \($0.pairedDays) j / \($0.pairedWeeks) sem" }.joined(separator: " · ")
    }
    private var provenanceText: String {
        let sources = (relation.coverageBySource ?? []).map(\.source)
        return sources.isEmpty ? "Calcul Soma" : "\(sources.joined(separator: " + ")) · calcul Soma"
    }
}
