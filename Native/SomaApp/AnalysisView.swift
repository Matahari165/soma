import SomaCore
import SwiftUI

struct AnalysisView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedRelationID: String?
    @State private var selectedChartLabel: String?

    private let periods = [("15", "15 j"), ("30", "30 j"), ("90", "90 j"), ("all", "Tout")]

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header(period: $model.analysisPeriod)
                content
            }
            .padding(horizontalSizeClass == .compact ? 16 : 32)
            .frame(maxWidth: 1_120, alignment: .leading)
        }
        .task(id: model.analysisPeriod) { await model.refreshAnalysis(period: model.analysisPeriod) }
        .onChange(of: selectedChartLabel) { _, label in
            guard let label, let relation = displayedRelations.first(where: { chartLabel(for: $0) == label }) else { return }
            selectedRelationID = relation.id
        }
        .somaScreen()
    }

    private func header(period: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Strongest Effects").font(.system(.largeTitle, design: .serif)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: 16)
                Text("Calcul Soma").font(.caption.monospaced()).foregroundStyle(SomaTheme.secondary)
            }
            Picker("Période d’analyse", selection: period) {
                ForEach(periods, id: \.0) { value, label in Text(label).tag(value) }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 420)
        }
    }

    @ViewBuilder private var content: some View {
        if model.isAnalysisLoading, model.matrix == nil {
            ProgressView("Calcul des relations…")
                .frame(minHeight: 240)
                .accessibilityLabel("Chargement de l’analyse")
        } else if let error = model.analysisErrorMessage, model.loadedAnalysisPeriod != model.analysisPeriod {
            VStack(spacing: 16) {
                ContentUnavailableView("Analyse indisponible", systemImage: "exclamationmark.triangle", description: Text(error))
                Button("Réessayer") { Task { await model.refreshAnalysis(period: model.analysisPeriod) } }
                    .buttonStyle(SomaPrimaryButtonStyle())
            }
        } else if model.loadedAnalysisPeriod != model.analysisPeriod {
            ProgressView("Actualisation de la période…").frame(minHeight: 240)
        } else if displayedRelations.isEmpty {
            insufficientState
        } else {
            AnalysisEffectsChart(relations: displayedRelations, outcomes: model.matrix?.outcomes ?? [], selectedLabel: $selectedChartLabel)
            HStack(alignment: .top, spacing: 32) {
                AnalysisRelationList(relations: displayedRelations, outcomes: model.matrix?.outcomes ?? [], selectedRelationID: $selectedRelationID)
                if horizontalSizeClass != .compact, let selectedRelation {
                    AnalysisRelationDetail(relation: selectedRelation, outcome: outcome(for: selectedRelation)).frame(maxWidth: 420)
                }
            }
            if horizontalSizeClass == .compact, let selectedRelation {
                AnalysisRelationDetail(relation: selectedRelation, outcome: outcome(for: selectedRelation))
            }
            Text("Associations personnelles, pas preuves de causalité · données et calculs restent sur le serveur Soma")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private var insufficientState: some View {
        VStack(alignment: .leading, spacing: 12) {
            ContentUnavailableView("Pas encore de relation robuste", systemImage: "chart.xyaxis.line", description: Text("Soma publie une relation seulement si l’échantillon, la correction des comparaisons multiples, l’effet pratique et la stabilité temporelle sont suffisants."))
            if let remaining = model.matrix?.collectionProgress?.sorted(by: { $0.recordedDays > $1.recordedDays }).first {
                Text("\(remaining.label) · \(remaining.recordedDays) jours mesurés sur \(remaining.requiredDays) requis")
                    .font(.caption.monospacedDigit()).foregroundStyle(SomaTheme.secondary)
            }
        }
    }

    private var displayedRelations: [MatrixRelation] { Array((model.matrix?.strongestRelations ?? []).prefix(8)) }
    private var selectedRelation: MatrixRelation? { displayedRelations.first(where: { $0.id == selectedRelationID }) ?? displayedRelations.first }
    private func outcome(for relation: MatrixRelation) -> MatrixOutcome? { model.matrix?.outcomes.first(where: { $0.id == relation.outcomeId }) }
    private func chartLabel(for relation: MatrixRelation) -> String { "\(relation.predictorLabel ?? relation.predictorId) → \(relation.outcomeLabel ?? relation.outcomeId)" }
}
