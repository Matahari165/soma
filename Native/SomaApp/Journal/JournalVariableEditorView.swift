import SwiftUI
import SomaCore

struct JournalVariableEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    let variable: JournalVariable?
    @State private var form: JournalVariableForm

    init(variable: JournalVariable? = nil) {
        self.variable = variable
        _form = State(initialValue: variable.map(JournalVariableForm.init) ?? JournalVariableForm())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Définition") {
                    TextField("Nom", text: $form.name)
                    TextField("Symbole", text: $form.emoji)
                    Picker("Type", selection: $form.variableType) {
                        ForEach(JournalVariableType.allCases, id: \.self) { type in
                            Text(type.label).tag(type)
                        }
                    }
                    .disabled(variable?.resolvedCaptureMode == .automatic)
                    if [.number, .count, .duration].contains(form.variableType) {
                        TextField("Unité", text: $form.unit)
                    }
                    if form.variableType == .category {
                        TextField("Choix séparés par des virgules", text: $form.options, axis: .vertical)
                            .lineLimit(2...4)
                        if form.parsedOptions.count < 2 {
                            Text("Ajoute au moins deux choix.").foregroundStyle(SomaTheme.warning)
                        }
                    }
                }
                Section("Suivi") {
                    Picker("Moment", selection: $form.dayPeriod) {
                        ForEach(JournalDayPeriod.allCases, id: \.self) { period in
                            Text(period.label).tag(period)
                        }
                    }
                    Picker("Objectif", selection: $form.trackingCadence) {
                        Text("Chaque jour").tag(JournalTrackingCadence.daily)
                        Text("Une fois par semaine").tag(JournalTrackingCadence.weekly)
                    }
                    if variable?.resolvedCaptureMode == .automatic {
                        LabeledContent("Source", value: variable?.automaticMetricId ?? "Automatique")
                    } else {
                        TextField("Valeur par défaut (facultative)", text: $form.defaultValue)
                            .font(.body.monospacedDigit())
                            #if os(iOS)
                            .keyboardType(form.variableType == .time ? .numbersAndPunctuation : .default)
                            #endif
                    }
                }
                if variable != nil {
                    Section {
                        Text("Le type ne peut plus changer après l’enregistrement d’une première valeur. Dans ce cas, archive cette habitude et crée-en une nouvelle.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                if let message = model.journalMutationErrorMessage {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(SomaTheme.warning)
                            .accessibilityLabel("Erreur. \(message)")
                    }
                }
            }
            .navigationTitle(variable == nil ? "Nouvelle habitude" : "Modifier l’habitude")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { Task { await save() } }
                        .disabled(!form.isValid || model.journalMutationIDs.contains(variable?.id ?? "new"))
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 560)
        #endif
    }

    private func save() async {
        let saved: Bool
        if let variable {
            saved = await model.updateJournalVariable(form.updateRequest(for: variable))
        } else {
            saved = await model.createJournalVariable(form.createRequest())
        }
        if saved { dismiss() }
    }
}

extension JournalVariableType {
    var label: String {
        switch self {
        case .boolean: "Oui / non"
        case .count: "Compteur"
        case .duration: "Durée"
        case .number: "Nombre"
        case .scale: "Échelle de 1 à 5"
        case .category: "Catégorie"
        case .time: "Heure"
        }
    }
}

extension JournalDayPeriod {
    var label: String {
        switch self {
        case .context: "Contexte"
        case .morning: "Matin"
        case .day: "Journée"
        case .evening: "Soir"
        case .sleep: "Avant le sommeil"
        case .other: "Autre"
        }
    }
}
