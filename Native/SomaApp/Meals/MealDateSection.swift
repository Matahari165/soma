import SwiftUI
import SomaCore

struct MealDateSection: View {
    let date: String
    let meals: [Meal]
    let onOpen: (Meal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(date)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(SomaTheme.secondary)
                .padding(.top, 8)
                .padding(.bottom, 4)
                .accessibilityAddTraits(.isHeader)
            ForEach(meals) { meal in
                MealTimelineRow(type: meal.mealType, meal: meal) { onOpen(meal) }
                Divider().overlay(SomaTheme.rule)
            }
        }
    }
}
