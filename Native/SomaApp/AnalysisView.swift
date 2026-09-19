import SwiftUI

struct AnalysisView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Text("Strongest Effects").font(.system(.largeTitle, design: .serif))
                    Spacer()
                    Text("30 jours").font(.system(.caption, design: .monospaced)).foregroundStyle(SomaTheme.secondary)
                }
                if let matrix = model.matrix {
                    ForEach(matrix.relations) { relation in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("\(relation.predictorLabel ?? relation.predictorId) → \(relation.outcomeLabel ?? relation.outcomeId)")
                            HStack {
                                Text(relation.effect?.formatted(.number.precision(.fractionLength(2))) ?? "—").font(.system(.title2, design: .monospaced))
                                Spacer()
                                Text("n = \(relation.sampleSize)").font(.system(.caption, design: .monospaced)).foregroundStyle(SomaTheme.secondary)
                            }
                            if let low = relation.effectConfidenceLow, let high = relation.effectConfidenceHigh {
                                Text("Intervalle \(low.formatted(.number.precision(.fractionLength(2)))) à \(high.formatted(.number.precision(.fractionLength(2))))")
                                    .font(.caption).foregroundStyle(SomaTheme.secondary)
                            }
                        }
                        .padding(.vertical, 12)
                        Divider().overlay(SomaTheme.rule)
                    }
                    Text("Calcul serveur · 30 jours").font(.system(.caption2, design: .monospaced)).foregroundStyle(SomaTheme.secondary)
                } else if model.isLoading {
                    ProgressView("Chargement des effets…")
                } else if let error = model.errorMessage {
                    Text(error).foregroundStyle(SomaTheme.warning)
                } else {
                    Text("Pas encore assez de données validées.").foregroundStyle(SomaTheme.secondary)
                }
            }
            .padding(24)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .task { if model.matrix == nil { await model.refreshAnalysis() } }
    }
}
