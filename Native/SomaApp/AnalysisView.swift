import SomaCore
import SwiftUI

struct AnalysisView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedRelationID: String?
    @State private var selectedChartLabel: String?
    @State private var requiresTemporalStability = true
    @State private var showsMatrix = false
    @State private var showsNonSignificant = false

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
        .onChange(of: model.analysisPeriod) { _, _ in selectedRelationID = nil; selectedChartLabel = nil }
        .onChange(of: requiresTemporalStability) { _, _ in selectedRelationID = nil; selectedChartLabel = nil }
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
                Text("Calcul Soma").font(SomaTheme.numberFont(12)).foregroundStyle(SomaTheme.secondary)
            }
            Picker("Période d’analyse", selection: period) {
                ForEach(periods, id: \.0) { value, label in Text(label).tag(value) }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 420)
            Toggle("Stabilité dans le temps", isOn: $requiresTemporalStability)
                .toggleStyle(.switch)
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
        if let matrix = model.matrix, model.loadedAnalysisPeriod == model.analysisPeriod {
            DisclosureGroup("Matrice des relations", isExpanded: $showsMatrix) {
                Toggle("Afficher aussi les relations non significatives", isOn: $showsNonSignificant)
                    .padding(.vertical, 8)
                AnalysisMatrixView(
                    matrix: matrix,
                    showsNonSignificant: showsNonSignificant
                )
            }
            .accessibilityHint("Explore les relations par influence et résultat")
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

    private var displayedRelations: [MatrixRelation] {
        let relations = requiresTemporalStability
            ? (model.matrix?.meaningfulRelations ?? model.matrix?.strongestRelations ?? [])
            : (model.matrix?.meaningfulRelationsWithoutStability ?? model.matrix?.meaningfulRelations ?? model.matrix?.strongestRelations ?? [])
        return Array(relations.prefix(8))
    }
    private var selectedRelation: MatrixRelation? {
        let allRelations = (model.matrix?.rows ?? []).flatMap(\.relations)
        return allRelations.first(where: { $0.id == selectedRelationID }) ?? displayedRelations.first
    }
    private func outcome(for relation: MatrixRelation) -> MatrixOutcome? { model.matrix?.outcomes.first(where: { $0.id == relation.outcomeId }) }
    private func chartLabel(for relation: MatrixRelation) -> String { "\(relation.predictorLabel ?? relation.predictorId) → \(relation.outcomeLabel ?? relation.outcomeId)" }
}
/// A compact native reading of the server's matrix. Statistical eligibility and
/// publication remain decisions of the server; this view only groups its rows.
struct AnalysisMatrixView: View {
    let matrix: NativeMatrixResponse
    let showsNonSignificant: Bool
    @State private var selectedRelation: MatrixRelation?

    private var publishedIDs: Set<String> {
        Set(matrix.publishedRelationIDs ?? (matrix.meaningfulRelations ?? matrix.strongestRelations).map(\.id))
    }

    private var rows: [MatrixRow] {
        matrix.rows.filter { row in
            row.relations.contains { showsNonSignificant ? isCalculable($0) : publishedIDs.contains($0.id) }
        }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 24) {
            if rows.isEmpty {
                Text(showsNonSignificant ? "Aucune relation calculable sur cette période." : "Aucune relation publiée sur cette période.")
                    .foregroundStyle(SomaTheme.secondary)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { indexedRow in
                let row = indexedRow.element
                VStack(alignment: .leading, spacing: 8) {
                    Text(row.label)
                        .font(.headline)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(visibleRelations(in: row)) { relation in
                        Button {
                            selectedRelation = relation
                        } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(relation.outcomeLabel ?? outcome(for: relation)?.label ?? relation.outcomeId)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(effectLabel(for: relation))
                                    .font(SomaTheme.numberFont())
                            }
                            .foregroundStyle(SomaTheme.primary)
                            .padding(.vertical, 8)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(row.label) vers \(relation.outcomeLabel ?? relation.outcomeId), \(effectLabel(for: relation)), \(lagLabel(relation.lagDays))")
                        .accessibilityHint("Ouvre le détail statistique")
                        Divider().overlay(SomaTheme.rule)
                    }
                }
            }
        }
        .sheet(item: $selectedRelation) { relation in
            ScrollView {
                AnalysisRelationDetail(relation: relation, outcome: outcome(for: relation))
                    .padding(16)
            }
            .somaScreen()
            #if os(iOS)
            .presentationDetents([.medium, .large])
            #endif
        }
    }

    private func visibleRelations(in row: MatrixRow) -> [MatrixRelation] {
        row.relations.filter { showsNonSignificant ? isCalculable($0) : publishedIDs.contains($0.id) }
    }

    private func isCalculable(_ relation: MatrixRelation) -> Bool {
        relation.excluded != true && relation.coefficient != nil
    }

    private func outcome(for relation: MatrixRelation) -> MatrixOutcome? {
        matrix.outcomes.first { $0.id == relation.outcomeId }
    }

    private func effectLabel(for relation: MatrixRelation) -> String {
        guard let effect = relation.effect else { return "Effet non calculable" }
        let unit = relation.outcomeUnit ?? outcome(for: relation)?.unit ?? ""
        let value = effect.formatted(.number.precision(.fractionLength(1)))
        let status = publishedIDs.contains(relation.id) ? "" : " · non publiée"
        return "\(value) \(unit)\(status)"
    }
}
