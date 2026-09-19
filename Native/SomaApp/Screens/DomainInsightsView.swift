import SwiftUI
import SomaCore

struct DomainInsightsView: View {
    @Environment(AppModel.self) private var model

    let title: String
    let keywords: [String]

    var body: some View {
        ScreenScaffold(title: title, context: "30 jours") {
            if let matrix = model.matrix {
                if relations(in: matrix).isEmpty {
                    ContentStateView(kind: .empty(
                        title: "Données indisponibles",
                        detail: "Aucune relation validée ne concerne \(title.lowercased()) sur cette période."
                    ))
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Relations observées")
                            .font(.system(.title2, design: .serif))
                            .accessibilityAddTraits(.isHeader)
                            .padding(.bottom, 8)
                        ForEach(relations(in: matrix)) { relation in
                            RelationSummaryRow(relation: relation)
                            Divider().overlay(SomaTheme.rule)
                        }
                        Text("Calcul serveur · jours validés uniquement")
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(SomaTheme.secondary)
                            .padding(.top, 16)
                    }
                }
            } else if model.isLoading {
                ContentStateView(kind: .loading("Chargement de \(title.lowercased())…"))
            } else if let error = model.errorMessage {
                ContentStateView(kind: .error(message: error, retry: {
                    Task { await model.refreshAnalysis() }
                }))
            } else {
                ContentStateView(kind: .empty(
                    title: "Analyse non chargée",
                    detail: "Charge les données disponibles pour rechercher des relations liées à \(title.lowercased())."
                ))
                Button("Charger l’analyse") { Task { await model.refreshAnalysis() } }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 44)
            }
        }
    }

    private func relations(in matrix: NativeMatrixResponse) -> [MatrixRelation] {
        matrix.relations.filter { relation in
            let searchable = [
                relation.predictorId,
                relation.outcomeId,
                relation.predictorLabel ?? "",
                relation.outcomeLabel ?? "",
            ].joined(separator: " ").folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            return keywords.contains { searchable.localizedCaseInsensitiveContains($0) }
        }
    }
}

private struct RelationSummaryRow: View {
    let relation: MatrixRelation

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(relation.predictorLabel ?? relation.predictorId) → \(relation.outcomeLabel ?? relation.outcomeId)")
            HStack {
                Text(relation.effect?.formatted(.number.precision(.fractionLength(2))) ?? "—")
                    .font(.system(.title2, design: .monospaced))
                    .accessibilityLabel(relation.effect.map { "Effet \($0.formatted(.number.precision(.fractionLength(2))))" } ?? "Effet indisponible")
                Spacer()
                Text("n = \(relation.sampleSize)")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityLabel("\(relation.sampleSize) observations")
            }
            if let low = relation.effectConfidenceLow, let high = relation.effectConfidenceHigh {
                Text("Intervalle \(low.formatted(.number.precision(.fractionLength(2)))) à \(high.formatted(.number.precision(.fractionLength(2))))")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}
