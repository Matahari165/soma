import SwiftUI

struct AccountDeletionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var confirmation = ""
    @State private var showsFinalConfirmation = false
    @FocusState private var isConfirmationFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Conséquences") {
                    Text("Le compte, le journal, les repas, les analyses, toutes les sessions et les fichiers de santé stockés par Soma seront définitivement supprimés.")
                    Text("Déconnecter une source de santé ne produit pas cet effet : seule cette suppression explicite efface l’historique importé.")
                        .foregroundStyle(SomaTheme.secondary)
                }
                Section("Confirmation") {
                    Text("Saisis exactement DELETE MY SOMA DATA")
                    TextField("DELETE MY SOMA DATA", text: $confirmation)
                        .focused($isConfirmationFocused)
                    if let error = model.accountDeletionErrorMessage {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SomaTheme.warning)
                    }
                }
                Section {
                    Button("Continuer vers la suppression", role: .destructive) {
                        showsFinalConfirmation = true
                    }
                    .disabled(confirmation != Self.requiredPhrase || model.isDeletingAccount)
                }
            }
            .navigationTitle("Supprimer le compte")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler", action: dismiss.callAsFunction)
                }
            }
            .confirmationDialog(
                "Supprimer définitivement le compte ?",
                isPresented: $showsFinalConfirmation,
                titleVisibility: .visible
            ) {
                Button("Supprimer définitivement", role: .destructive) {
                    Task {
                        if await model.deleteAccount(confirmation: confirmation) { dismiss() }
                    }
                }
                Button("Annuler", role: .cancel) { }
            } message: {
                Text("Cette action est irréversible et ferme toutes les sessions.")
            }
        }
        .frame(minWidth: 360, minHeight: 430)
        .task { isConfirmationFocused = true }
    }

    private static let requiredPhrase = "DELETE MY SOMA DATA"
}
