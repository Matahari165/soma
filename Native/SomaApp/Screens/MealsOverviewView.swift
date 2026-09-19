import SwiftUI
import SomaCore

struct MealsOverviewView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScreenScaffold(title: "Repas", context: model.activeDate.rawValue) {
            if let slots = model.day?.meals {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(rows(slots), id: \.type) { row in
                        HStack(alignment: .firstTextBaseline) {
                            Text(row.label)
                            Spacer()
                            Text(status(for: row.meal))
                                .font(.system(.callout, design: .monospaced))
                                .foregroundStyle(color(for: row.meal))
                        }
                        .frame(minHeight: 52)
                        .accessibilityElement(children: .combine)
                        Divider().overlay(SomaTheme.rule)
                    }
                }
            } else if model.isLoading {
                ContentStateView(kind: .loading("Chargement des repas…"))
            } else if let error = model.errorMessage {
                ContentStateView(kind: .error(message: error, retry: {
                    Task { try? await model.refreshDay() }
                }))
            } else {
                ContentStateView(kind: .empty(
                    title: "Repas indisponibles",
                    detail: "Aucune journée n’est chargée pour cette date."
                ))
            }
        }
    }

    private func rows(_ slots: MealSlots) -> [(type: MealType, label: String, meal: MealSummary?)] {
        [
            (.breakfast, "Petit-déjeuner", slots.breakfast),
            (.lunch, "Déjeuner", slots.lunch),
            (.dinner, "Dîner", slots.dinner),
            (.snack, "Collation", slots.snack),
        ]
    }

    private func status(for meal: MealSummary?) -> String {
        guard let meal else { return "Absent" }
        if meal.entryState == "skipped" { return "Ignoré" }
        return meal.status == "confirmed" ? "Confirmé" : "Brouillon"
    }

    private func color(for meal: MealSummary?) -> Color {
        guard let meal else { return SomaTheme.secondary }
        return meal.entryState == "skipped" ? SomaTheme.warning : SomaTheme.primary
    }
}
