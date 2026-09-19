import SwiftUI
import SomaCore

struct DayView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var mealEditor: MealEditorTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                dateHeader
                JournalSectionView()
                meals
            }
            .padding(.horizontal, horizontalSizeClass == .compact ? 16 : 24)
            .padding(.vertical, 24)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .navigationTitle("Jour")
        .sheet(item: $mealEditor) { target in
            MealEditorView(mealType: target.type, mealID: target.mealID)
        }
    }

    private var dateHeader: some View {
        HStack {
            Button("Jour précédent", systemImage: "chevron.left") { Task { await model.shiftDate(by: -1) } }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
            Text(model.activeDate.rawValue).font(.system(.title2, design: .monospaced)).accessibilityLabel("Date active, \(model.activeDate.rawValue)")
            Button("Jour suivant", systemImage: "chevron.right") { Task { await model.shiftDate(by: 1) } }
                .labelStyle(.iconOnly)
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
    }

    private var meals: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Repas")
                .font(.system(.title2, design: .serif))
                .accessibilityAddTraits(.isHeader)
            if let slots = model.day?.meals {
                ForEach(mealRows(slots), id: \.type) { row in
                    Button {
                        Task {
                            await model.openMeal(row.type)
                            mealEditor = MealEditorTarget(type: row.type, mealID: row.meal?.id)
                        }
                    } label: {
                        HStack {
                        Text(row.label)
                        Spacer()
                        if let meal = row.meal {
                            Text(meal.entryState == "skipped" ? "Ignoré" : meal.status == "confirmed" ? "Confirmé" : "Brouillon")
                                .foregroundStyle(meal.entryState == "skipped" ? SomaTheme.warning : SomaTheme.primary)
                        } else { Text("Absent").foregroundStyle(SomaTheme.secondary) }
                        Image(systemName: "chevron.right").foregroundStyle(SomaTheme.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .accessibilityLabel("\(row.label), \(row.meal?.entryState == "skipped" ? "ignoré" : row.meal?.status == "confirmed" ? "confirmé" : row.meal == nil ? "absent" : "brouillon")")
                }
            }
        }
    }

    private func mealRows(_ slots: MealSlots) -> [(type: MealType, label: String, meal: MealSummary?)] {
        [
            (.breakfast, "Petit-déjeuner", slots.breakfast),
            (.lunch, "Déjeuner", slots.lunch),
            (.dinner, "Dîner", slots.dinner),
            (.snack, "Collation", slots.snack),
        ]
    }

}
