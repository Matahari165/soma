import SwiftUI
import SomaCore

struct JournalManagerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    @State private var editor: JournalVariable?
    @State private var createsVariable = false
    @State private var archiveCandidate: JournalVariable?

    var body: some View {
        NavigationStack {
            List {
                if let message = model.journalMutationErrorMessage {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(SomaTheme.warning)
                            .accessibilityLabel("Erreur. \(message)")
                    }
                }
                Section {
                    if variables.isEmpty {
                        ContentUnavailableView("Aucune habitude", systemImage: "list.bullet.clipboard")
                    } else {
                        ForEach(variables) { variable in
                            row(variable)
                        }
                    }
                } footer: {
                    Text("Supprimer du suivi conserve toutes les anciennes réponses.")
                }
            }
            .navigationTitle("Habitudes")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Terminé") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Ajouter une habitude", systemImage: "plus") { createsVariable = true }
                }
            }
            .sheet(isPresented: $createsVariable) {
                JournalVariableEditorView().environment(model)
            }
            .sheet(item: $editor) { variable in
                JournalVariableEditorView(variable: variable).environment(model)
            }
            .confirmationDialog(
                "Supprimer cette habitude du suivi ?",
                isPresented: archiveBinding,
                titleVisibility: .visible,
                presenting: archiveCandidate
            ) { variable in
                Button("Supprimer \(variable.name) du suivi", role: .destructive) {
                    Task { _ = await model.updateJournalVariable(JournalVariableUpdateRequest(id: variable.id, isActive: false)) }
                }
                Button("Annuler", role: .cancel) { archiveCandidate = nil }
            } message: { _ in
                Text("Les anciennes valeurs resteront dans l’historique.")
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 520)
        #endif
    }

    private var variables: [JournalVariable] {
        (model.day?.variables ?? []).filter(\.isActive).sorted { $0.position < $1.position }
    }

    private var archiveBinding: Binding<Bool> {
        Binding(
            get: { archiveCandidate != nil },
            set: { if !$0 { archiveCandidate = nil } }
        )
    }

    private func row(_ variable: JournalVariable) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(variable.name)
                Text(variable.resolvedCaptureMode == .automatic ? "Automatique" : variable.variableType.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Déplacer plus haut", systemImage: "arrow.up") {
                Task { await move(variable, offset: -1) }
            }
            .labelStyle(.iconOnly)
            .disabled(variables.first?.id == variable.id || model.journalMutationIDs.contains(variable.id))
            Button("Déplacer plus bas", systemImage: "arrow.down") {
                Task { await move(variable, offset: 1) }
            }
            .labelStyle(.iconOnly)
            .disabled(variables.last?.id == variable.id || model.journalMutationIDs.contains(variable.id))
            Menu("Actions", systemImage: "ellipsis") {
                Button("Modifier", systemImage: "pencil") { editor = variable }
                Button("Supprimer du suivi", systemImage: "archivebox", role: .destructive) { archiveCandidate = variable }
            }
            .labelStyle(.iconOnly)
        }
        .frame(minHeight: 44)
    }

    private func move(_ variable: JournalVariable, offset: Int) async {
        guard let index = variables.firstIndex(where: { $0.id == variable.id }) else { return }
        let target = index + offset
        guard variables.indices.contains(target) else { return }
        let targetPosition = variables[target].position
        _ = await model.updateJournalVariable(JournalVariableUpdateRequest(id: variable.id, position: targetPosition + (offset < 0 ? -1 : 1)))
    }
}
