import SwiftUI
import SomaCore

struct MealsOverviewView: View {
    @Environment(AppModel.self) private var model
    @State private var editorTarget: MealEditorTarget?

    var body: some View {
        ScreenScaffold(title: "Repas", context: model.activeDate.rawValue) {
            dateControls
            if model.isLoadingMeals && model.mealHistory.isEmpty {
                ContentStateView(kind: .loading("Chargement des repas…"))
            } else if let message = model.mealsErrorMessage, model.mealHistory.isEmpty {
                ContentStateView(kind: .error(message: message, retry: { Task { await model.refreshMeals() } }))
            } else {
                currentDay
                history
                provenance
            }
        }
        .task(id: model.activeDate) { await model.refreshMeals() }
        .refreshable { await model.refreshMeals() }
        .sheet(item: $editorTarget) { target in
            MealEditorView(mealType: target.type, mealID: target.mealID)
        }
    }

    private var dateControls: some View {
        HStack(spacing: 8) {
            Button("Jour précédent", systemImage: "chevron.left") { Task { await model.shiftDate(by: -1) } }
                .labelStyle(.iconOnly)
            Text(model.activeDate.rawValue)
                .font(.system(.body, design: .monospaced))
                .accessibilityLabel("Date active, \(model.activeDate.rawValue)")
            Button("Jour suivant", systemImage: "chevron.right") { Task { await model.shiftDate(by: 1) } }
                .labelStyle(.iconOnly)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
    }

    private var currentDay: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Journal du jour")
                .font(.system(.title2, design: .serif))
            ForEach(MealType.allCases, id: \.self) { type in
                let meal = model.mealHistory.first { $0.mealDate == model.activeDate.rawValue && $0.mealType == type }
                MealTimelineRow(type: type, meal: meal) {
                    Task {
                        await model.openMeal(type, mealID: meal?.id)
                        editorTarget = MealEditorTarget(type: type, mealID: meal?.id)
                    }
                }
                Divider().overlay(SomaTheme.rule)
            }
        }
    }

    @ViewBuilder
    private var history: some View {
        let earlierMeals = model.mealHistory.filter { $0.mealDate != model.activeDate.rawValue }
        VStack(alignment: .leading, spacing: 16) {
            Text("Historique")
                .font(.system(.title2, design: .serif))
            if earlierMeals.isEmpty {
                Text("Aucun autre repas enregistré sur les 28 derniers jours.")
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityLabel("Historique vide. Aucun autre repas enregistré sur les 28 derniers jours.")
            } else {
                ForEach(groupedHistory(earlierMeals), id: \.date) { group in
                    MealDateSection(date: group.date, meals: group.meals) { meal in
                        Task {
                            await model.openMeal(meal.mealType, mealID: meal.id)
                            editorTarget = MealEditorTarget(type: meal.mealType, mealID: meal.id)
                        }
                    }
                }
            }
        }
    }

    private var provenance: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().overlay(SomaTheme.rule)
            Text("Provenance").font(.headline)
            Text("Repas saisis dans Soma · Résultats nutritionnels calculés par Soma après confirmation.")
                .foregroundStyle(SomaTheme.secondary)
            Text("Les créneaux absents restent absents ; ils ne valent jamais zéro.")
                .foregroundStyle(SomaTheme.secondary)
        }
        .font(.callout)
    }

    private func groupedHistory(_ meals: [Meal]) -> [(date: String, meals: [Meal])] {
        Dictionary(grouping: meals, by: \.mealDate)
            .map { (date: $0.key, meals: $0.value.sorted { $0.mealType.sortOrder < $1.mealType.sortOrder }) }
            .sorted { $0.date > $1.date }
    }
}
