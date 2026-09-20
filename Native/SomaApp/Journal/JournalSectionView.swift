import SwiftUI
import SomaCore

struct JournalSectionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var presentsManager = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            content
            archivedHistory
            status
        }
        .sheet(isPresented: $presentsManager) {
            JournalManagerView()
                .environment(model)
        }
    }

    @ViewBuilder
    private var archivedHistory: some View {
        if let day = model.day, let draft = model.journalDraft {
            let recorded = day.variables
                .filter { !$0.isActive && draft.state(for: $0.id) == .recorded }
                .sorted { $0.position < $1.position }
            if !recorded.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Anciennes habitudes")
                        .font(.headline)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(recorded) { variable in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(variable.name)
                            Spacer(minLength: 8)
                            Text(archivedValue(draft.values[variable.id] ?? .null, unit: variable.unit))
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(SomaTheme.secondary)
                        }
                        .frame(minHeight: 44)
                        Divider().overlay(SomaTheme.rule)
                    }
                }
                .accessibilityHint("Valeurs conservées, non demandées dans le suivi quotidien")
            }
        }
    }

    private func archivedValue(_ value: JSONValue, unit: String?) -> String {
        let text: String
        switch value {
        case .bool(let answer): text = answer ? "Oui" : "Non"
        case .null: text = "Non renseigné"
        default: text = JournalValueParser.text(value)
        }
        guard let unit, !unit.isEmpty, value != .null else { return text }
        return "\(text) \(unit)"
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Journal")
                    .font(.system(.title2, design: .serif))
                    .accessibilityAddTraits(.isHeader)
                if let day = model.day, let draft = model.journalDraft {
                    let active = day.variables.filter(\.isActive)
                    Text("\(draft.completedCount(for: active)) sur \(active.count) renseignées")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("Modifier les habitudes", systemImage: "slider.horizontal.3") {
                presentsManager = true
            }
            .labelStyle(.titleAndIcon)
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityHint("Créer, modifier, réordonner ou archiver une habitude")
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading, model.day == nil {
            VStack(alignment: .leading, spacing: 12) {
                ProgressView()
                Text("Chargement du journal…")
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 120, alignment: .leading)
            .accessibilityElement(children: .combine)
        } else if let day = model.day, let draft = model.journalDraft {
            let variables = day.variables.filter(\.isActive).sorted { $0.position < $1.position }
            if variables.isEmpty {
                ContentUnavailableView {
                    Label("Aucune habitude", systemImage: "list.bullet.clipboard")
                } description: {
                    Text("Ajoute une première habitude pour commencer le journal.")
                } actions: {
                    Button("Ajouter une habitude") { presentsManager = true }
                }
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(variables) { variable in
                        JournalFieldRow(
                            variable: variable,
                            value: draft.values[variable.id] ?? .null,
                            state: draft.state(for: variable.id),
                            onChange: { model.setJournalValue($0, for: variable.id) }
                        )
                        Divider().overlay(SomaTheme.rule)
                    }
                }
                .overlay(alignment: .top) { Divider().overlay(SomaTheme.rule) }

                Button(day.day?.status == .validated ? "Valider les corrections" : "Valider la journée") {
                    Task { await model.validateJournal() }
                }
                .buttonStyle(SomaPrimaryButtonStyle())
                .frame(maxWidth: horizontalSizeClass == .compact ? .infinity : nil)
                .disabled(model.journalSaveState == .saving)
                .accessibilityHint("Les valeurs absentes resteront absentes")
            }
        } else {
            ContentUnavailableView {
                Label("Journal indisponible", systemImage: "exclamationmark.triangle")
            } description: {
                Text(model.errorMessage ?? "Cette journée n’a pas pu être chargée.")
            } actions: {
                Button("Réessayer") { Task { await model.retryDayLoad() } }
            }
        }
    }

    @ViewBuilder
    private var status: some View {
        switch model.journalSaveState {
        case .idle:
            if model.day?.day?.status == .validated {
                Label("Journée validée", systemImage: "checkmark.circle")
                    .foregroundStyle(SomaTheme.signal)
                    .accessibilityLabel("Journée validée. Les corrections restent incluses dans les analyses.")
            }
        case .saving:
            Label("Enregistrement…", systemImage: "arrow.trianglehead.2.clockwise.rotate.90")
                .foregroundStyle(.secondary)
        case .saved:
            Label(model.day?.day?.status == .validated ? "Corrections enregistrées" : "Brouillon enregistré", systemImage: "checkmark")
                .foregroundStyle(.secondary)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 8) {
                Label(message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(SomaTheme.warning)
                Button("Réessayer", action: model.retryJournalSave)
            }
        }
    }
}
