import CoreTransferable
import PhotosUI
import SwiftUI
import SomaCore
import UniformTypeIdentifiers

struct MealEditorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let mealType: MealType
    let mealID: String?

    @State private var note = ""
    @State private var selection: [PhotosPickerItem] = []
    @State private var importError: String?
    @State private var confirmsDeletion = false
    @State private var draftPhotoComments: [UUID: String] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let draft = model.mealDrafts[mealType] {
                        skippedControl(draft)
                        if draft.entryState == .recorded {
                            noteEditor
                            if let meal = remoteMeal, !meal.photos.isEmpty {
                                RemoteMealPhotosView(meal: meal)
                            }
                            photoSection(draft)
                            submissionSection(draft)
                            if let result = displayedAnalysis?.result {
                                MealAnalysisResultView(result: result)
                            }
                        }
                        if remoteMeal != nil { deletionSection }
                    } else {
                        ProgressView("Ouverture du brouillon…")
                    }
                }
                .padding(24)
                .frame(maxWidth: 720, alignment: .leading)
            }
            .navigationTitle(mealType.label)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
        .task {
            note = model.mealDrafts[mealType]?.note ?? ""
            draftPhotoComments = Dictionary(uniqueKeysWithValues: (model.mealDrafts[mealType]?.photos ?? []).map { ($0.id, $0.comment ?? "") })
        }
        .onChange(of: selection) { _, items in Task { await importPhotos(items) } }
        .confirmationDialog(
            "Supprimer ce repas ?",
            isPresented: $confirmsDeletion,
            titleVisibility: .visible
        ) {
            Button("Supprimer le repas", role: .destructive) { Task { await deleteMeal() } }
            Button("Annuler", role: .cancel) { }
        } message: {
            Text("La note, les résultats nutritionnels et les métadonnées des photos seront supprimés.")
        }
    }

    private func skippedControl(_ draft: MealDraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if draft.entryState == .skipped {
                Label("Repas ignoré", systemImage: "minus.circle")
                    .font(.headline)
                Text("Ce créneau ne produit aucune donnée nutritionnelle.")
                    .foregroundStyle(SomaTheme.secondary)
                Button("Réactiver ce repas") { Task { await model.setMealSkipped(false, for: mealType) } }
                    .buttonStyle(.bordered)
            } else {
                Button("Je n’ai pas pris ce repas", systemImage: "minus.circle") {
                    Task { await model.setMealSkipped(true, for: mealType) }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var noteEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Description").font(.headline)
            TextEditor(text: $note)
                .frame(minHeight: 110)
                .padding(8)
                .background(SomaTheme.rule.opacity(0.35))
                .clipShape(.rect(cornerRadius: 8))
                .accessibilityLabel("Description du repas")
                .onChange(of: note) { _, value in
                    let normalized = String(value.prefix(500))
                    if value != normalized {
                        note = normalized
                        return
                    }
                    guard normalized != (model.mealDrafts[mealType]?.note ?? "") else { return }
                    Task { await model.setMealNote(normalized, for: mealType) }
                }
            Text("\(note.count)/500")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
        }
    }

    private func photoSection(_ draft: MealDraft) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Photos").font(.headline)
                Spacer()
                Text("\(draft.photos.count)/6").foregroundStyle(SomaTheme.secondary)
            }
            PhotosPicker(selection: $selection, maxSelectionCount: max(0, 6 - draft.photos.count), matching: .images) {
                Label("Choisir des photos", systemImage: "photo.on.rectangle")
            }
            .buttonStyle(.bordered)
            .disabled(draft.photos.count >= 6 || draft.stage.isBusy)

            ForEach(draft.photos) { photo in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label(photo.filename, systemImage: "photo")
                            .lineLimit(1)
                        Spacer()
                        Button("Supprimer", systemImage: "trash", role: .destructive) {
                            Task { await model.removeMealPhoto(photo.id, from: mealType) }
                        }
                        .labelStyle(.iconOnly)
                        .disabled(draft.stage.isBusy)
                    }
                    Picker("Origine de \(photo.filename)", selection: originBinding(photo)) {
                        Text("À préciser").tag(MealPhotoOrigin.unknown)
                        Text("Maison").tag(MealPhotoOrigin.homemade)
                        Text("Préparé / acheté").tag(MealPhotoOrigin.prepared)
                        Text("Mixte").tag(MealPhotoOrigin.mixed)
                    }
                    .pickerStyle(.menu)
                    TextField("Commentaire facultatif pour cette photo", text: commentBinding(photo), axis: .vertical)
                        .lineLimit(1...3)
                        .textFieldStyle(.roundedBorder)
                        .disabled(draft.stage.isBusy)
                        .accessibilityHint("Décrit uniquement cette photo, indépendamment de la description générale")
                    Button("Enregistrer le commentaire") {
                        Task { await model.setPhotoComment(draftPhotoComments[photo.id] ?? "", photoID: photo.id, for: mealType) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(draft.stage.isBusy)
                }
                .padding(.vertical, 6)
                Divider().overlay(SomaTheme.rule)
            }
            if let importError {
                Text(importError).foregroundStyle(.red).accessibilityLabel("Erreur : \(importError)")
            }
        }
    }

    private func submissionSection(_ draft: MealDraft) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if draft.stage.isBusy {
                ProgressView(draft.stage.label)
                    .accessibilityLabel(draft.stage.label)
            } else if draft.stage == .awaitingConfirmation {
                Label("Résultat à confirmer", systemImage: "checkmark.circle")
                    .foregroundStyle(SomaTheme.primary)
            } else if draft.stage == .confirmed {
                Label("Repas confirmé", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(SomaTheme.primary)
            } else if draft.stage == .failed {
                Label("Envoi interrompu", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(SomaTheme.warning)
                Text("Le brouillon est conservé. Tu peux reprendre sans créer de doublon.")
                    .foregroundStyle(SomaTheme.secondary)
            }

            if draft.stage == .awaitingConfirmation {
                Button("Confirmer le résultat", systemImage: "checkmark") {
                    Task { await model.confirmMeal(mealType) }
                }
                .buttonStyle(.borderedProminent)
            } else if draft.stage != .confirmed {
                Button(draft.stage == .failed ? "Réessayer" : draft.stage == .polling ? "Reprendre le suivi" : "Analyser le repas", systemImage: draft.stage == .failed ? "arrow.clockwise" : "sparkles") {
                    Task { await model.submitMeal(mealType) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!draft.canSubmit || draft.stage.isBusy)
            }
        }
    }

    private var deletionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().overlay(SomaTheme.rule)
            Button("Supprimer le repas", systemImage: "trash", role: .destructive) {
                confirmsDeletion = true
            }
            .frame(minHeight: 44)
        }
    }

    private var remoteMeal: Meal? {
        (mealID ?? model.mealDrafts[mealType]?.remoteMealId).flatMap { model.mealDetails[$0] }
    }

    private var displayedAnalysis: MealAnalysisRecord? {
        guard let draft = model.mealDrafts[mealType], draft.stage == .awaitingConfirmation || draft.stage == .confirmed else { return nil }
        guard let meal = remoteMeal else { return nil }
        if meal.analysis?.status == "completed" { return meal.analysis }
        return meal.lastSuccessfulAnalysis
    }

    private func deleteMeal() async {
        guard let meal = remoteMeal, await model.deleteMeal(meal) else { return }
        dismiss()
    }

    private func originBinding(_ photo: MealDraftPhoto) -> Binding<MealPhotoOrigin> {
        Binding(
            get: { model.mealDrafts[mealType]?.photos.first(where: { $0.id == photo.id })?.origin ?? .unknown },
            set: { origin in Task { await model.setPhotoOrigin(origin, photoID: photo.id, for: mealType) } }
        )
    }

    private func commentBinding(_ photo: MealDraftPhoto) -> Binding<String> {
        Binding(
            get: { draftPhotoComments[photo.id] ?? photo.comment ?? "" },
            set: { draftPhotoComments[photo.id] = String($0.prefix(240)) }
        )
    }

    private func importPhotos(_ items: [PhotosPickerItem]) async {
        defer { selection = [] }
        importError = nil
        for item in items {
            do {
                guard let imported = try await item.loadTransferable(type: ImportedMealPhoto.self) else { continue }
                try await model.addMealPhoto(sourceURL: imported.url, filename: imported.filename, mimeType: imported.mimeType, to: mealType)
                try? FileManager.default.removeItem(at: imported.url)
            } catch {
                importError = "Une photo n’a pas pu être préparée. Choisis une image JPEG ou PNG."
                return
            }
        }
    }
}

private struct ImportedMealPhoto: Transferable {
    let url: URL
    let filename: String
    let mimeType: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            let ext = received.file.pathExtension.lowercased()
            guard ["jpg", "jpeg", "png"].contains(ext) else { throw MealPhotoImportError.unsupportedFormat }
            let temporary = FileManager.default.temporaryDirectory.appending(path: "soma-\(UUID().uuidString).\(ext)")
            try FileManager.default.copyItem(at: received.file, to: temporary)
            return ImportedMealPhoto(
                url: temporary,
                filename: received.file.lastPathComponent,
                mimeType: ext == "png" ? "image/png" : "image/jpeg"
            )
        }
    }
}

private enum MealPhotoImportError: Error { case unsupportedFormat }

private extension MealDraftStage {
    var isBusy: Bool { [.creating, .uploading, .requestingAnalysis].contains(self) }
    var label: String {
        switch self {
        case .local: "Brouillon enregistré"
        case .creating: "Création du repas…"
        case .uploading: "Envoi des photos…"
        case .requestingAnalysis: "Lancement de l’analyse…"
        case .polling: "Analyse en cours…"
        case .awaitingConfirmation: "Résultat à confirmer"
        case .confirmed: "Repas confirmé"
        case .failed: "Envoi interrompu"
        case .completed: "Résultat à confirmer"
        }
    }
}

private extension MealDraft {
    var canSubmit: Bool {
        entryState == .skipped || (
            (hasRemotePhotoEvidence == true || !photos.isEmpty || !(note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            && photos.allSatisfy { $0.origin != .unknown }
        )
    }
}
