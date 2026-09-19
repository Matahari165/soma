import SwiftUI
import SomaCore

struct RemoteMealPhotosView: View {
    @Environment(AppModel.self) private var model
    let meal: Meal

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Photos enregistrées").font(.headline)
            ForEach(meal.photos) { photo in
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
                .frame(minHeight: 44)
                Divider().overlay(SomaTheme.rule)
            }
        }
    }
}
