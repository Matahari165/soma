import SwiftUI
import SomaCore

struct RemoteMealPhotosView: View {
    @Environment(AppModel.self) private var model
    let meal: Meal
    @State private var comments: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Photos enregistrées").font(.headline)
            ForEach(meal.photos) { photo in
                VStack(alignment: .leading, spacing: 8) {
                  HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Label(photo.filename ?? "Photo", systemImage: photo.storageStatus == "purged" ? "photo.badge.checkmark" : "photo")
                            .lineLimit(1)
                        Text(photo.storageStatus == "purged" ? "Image supprimée après confirmation · \(photo.origin.label)" : photo.origin.label)
                            .font(.caption)
                            .foregroundStyle(SomaTheme.secondary)
                    }
                    Spacer()
                    if meal.status != .confirmed && photo.storageStatus != "purged" {
                        Menu("Provenance", systemImage: "tag") {
                            ForEach([MealPhotoOrigin.homemade, .prepared, .mixed], id: \.self) { origin in
                                Button(origin.label) {
                                    Task { await model.updateRemotePhotoOrigin(origin, mealID: meal.id, photoID: photo.id) }
                                }
                            }
                        }
                        .labelStyle(.iconOnly)
                        Button("Supprimer la photo", systemImage: "trash", role: .destructive) {
                            Task { await model.deleteRemotePhoto(mealID: meal.id, photoID: photo.id) }
                        }
                        .labelStyle(.iconOnly)
                    }
                  }
                  if meal.status != .confirmed && photo.storageStatus != "purged" {
                      TextField("Commentaire facultatif", text: Binding(
                          get: { comments[photo.id] ?? photo.comment ?? "" },
                          set: { comments[photo.id] = String($0.prefix(240)) }
                      ), axis: .vertical)
                      .lineLimit(1...3)
                      .textFieldStyle(.roundedBorder)
                      .onSubmit { Task { await model.updateRemotePhotoComment(comments[photo.id] ?? "", mealID: meal.id, photoID: photo.id) } }
                      Button("Enregistrer le commentaire") {
                          Task { await model.updateRemotePhotoComment(comments[photo.id] ?? "", mealID: meal.id, photoID: photo.id) }
                      }
                      .buttonStyle(.bordered)
                  } else if let comment = photo.comment, !comment.isEmpty {
                      Text(comment).font(.callout).foregroundStyle(SomaTheme.secondary)
                  }
                }
                .frame(minHeight: 44)
                Divider().overlay(SomaTheme.rule)
            }
        }
        .task(id: meal.id) { comments = Dictionary(uniqueKeysWithValues: meal.photos.map { ($0.id, $0.comment ?? "") }) }
    }
}
