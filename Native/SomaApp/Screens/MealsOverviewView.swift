import Foundation
import Observation
import SwiftUI
import SomaCore

@MainActor
protocol NutritionDataProvider {
    func loadNutrition(for date: LocalDate, days: Int) async throws -> NativeNutritionResponse
    func upsertSupplementEntry(_ body: NutritionSupplementEntryRequest) async throws -> NutritionSupplementEntry
    func updateSupplementEntry(id: String, body: NutritionSupplementEntryUpdateRequest) async throws -> NutritionSupplementEntry
    func deleteSupplementEntry(id: String) async throws
    func createSupplementDefinition(_ body: NutritionSupplementDefinitionCreateRequest) async throws -> NutritionSupplementDefinition
    func updateSupplementDefinition(id: String, body: NutritionSupplementDefinitionUpdateRequest) async throws -> NutritionSupplementDefinition
    func deleteSupplementDefinition(id: String) async throws
    func createRecipe(_ body: NutritionRecipeCreateRequest) async throws -> NutritionRecipe
    func updateRecipe(id: String, body: NutritionRecipeUpdateRequest) async throws -> NutritionRecipe
    func deleteRecipe(id: String) async throws
}

@MainActor
private struct AppModelNutritionDataProvider: NutritionDataProvider {
    let model: AppModel

    func loadNutrition(for date: LocalDate, days: Int) async throws -> NativeNutritionResponse {
        try await model.loadNutrition(for: date, days: days)
    }

    func upsertSupplementEntry(_ body: NutritionSupplementEntryRequest) async throws -> NutritionSupplementEntry {
        try await model.upsertNutritionSupplementEntry(body).entry
    }

    func updateSupplementEntry(id: String, body: NutritionSupplementEntryUpdateRequest) async throws -> NutritionSupplementEntry {
        try await model.updateNutritionSupplementEntry(id: id, body: body).entry
    }

    func deleteSupplementEntry(id: String) async throws {
        try await model.deleteNutritionSupplementEntry(id: id)
    }

    func createSupplementDefinition(_ body: NutritionSupplementDefinitionCreateRequest) async throws -> NutritionSupplementDefinition {
        try await model.createNutritionSupplementDefinition(body).definition
    }

    func updateSupplementDefinition(id: String, body: NutritionSupplementDefinitionUpdateRequest) async throws -> NutritionSupplementDefinition {
        try await model.updateNutritionSupplementDefinition(id: id, body: body).definition
    }

    func deleteSupplementDefinition(id: String) async throws {
        try await model.deleteNutritionSupplementDefinition(id: id)
    }

    func createRecipe(_ body: NutritionRecipeCreateRequest) async throws -> NutritionRecipe {
        try await model.createNutritionRecipe(body).recipe
    }

    func updateRecipe(id: String, body: NutritionRecipeUpdateRequest) async throws -> NutritionRecipe {
        try await model.updateNutritionRecipe(id: id, body: body).recipe
    }

    func deleteRecipe(id: String) async throws {
        try await model.deleteNutritionRecipe(id: id)
    }
}

@MainActor
@Observable
final class NutritionViewModel {
    var snapshot: NativeNutritionResponse?
    var isLoading = false
    var errorMessage: String?

    func refresh(for date: LocalDate, days: Int = 30, using provider: any NutritionDataProvider) async {
        isLoading = true
        errorMessage = nil
        if snapshot?.date != date.rawValue {
            snapshot = nil
        }
        defer { isLoading = false }
        do {
            snapshot = try await provider.loadNutrition(for: date, days: days)
        } catch {
            errorMessage = "Les données nutritionnelles n’ont pas pu être chargées."
        }
    }

    @discardableResult
    func setSupplementStatus(
        definitionID: String,
        date: String,
        status: String,
        using provider: any NutritionDataProvider
    ) async -> Bool {
        do {
            _ = try await provider.upsertSupplementEntry(.init(definitionId: definitionID, entryDate: date, status: status))
            return true
        } catch {
            errorMessage = "La prise du complément n’a pas pu être enregistrée."
            return false
        }
    }

    @discardableResult
    func deleteSupplementEntry(id: String, using provider: any NutritionDataProvider) async -> Bool {
        do {
            try await provider.deleteSupplementEntry(id: id)
            return true
        } catch {
            errorMessage = "La prise du complément n’a pas pu être supprimée."
            return false
        }
    }

    @discardableResult
    func createSupplementDefinition(_ body: NutritionSupplementDefinitionCreateRequest, using provider: any NutritionDataProvider) async -> Bool {
        do {
            _ = try await provider.createSupplementDefinition(body)
            return true
        } catch {
            errorMessage = "Le complément n’a pas pu être enregistré."
            return false
        }
    }

    @discardableResult
    func updateSupplementDefinition(id: String, body: NutritionSupplementDefinitionUpdateRequest, using provider: any NutritionDataProvider) async -> Bool {
        do {
            _ = try await provider.updateSupplementDefinition(id: id, body: body)
            return true
        } catch {
            errorMessage = "Le complément n’a pas pu être modifié."
            return false
        }
    }

    @discardableResult
    func deleteSupplementDefinition(id: String, using provider: any NutritionDataProvider) async -> Bool {
        do {
            try await provider.deleteSupplementDefinition(id: id)
            return true
        } catch {
            errorMessage = "Le complément n’a pas pu être archivé."
            return false
        }
    }

    @discardableResult
    func createRecipe(_ body: NutritionRecipeCreateRequest, using provider: any NutritionDataProvider) async -> Bool {
        do {
            _ = try await provider.createRecipe(body)
            return true
        } catch {
            errorMessage = "La recette n’a pas pu être enregistrée."
            return false
        }
    }

    @discardableResult
    func updateRecipe(id: String, body: NutritionRecipeUpdateRequest, using provider: any NutritionDataProvider) async -> Bool {
        do {
            _ = try await provider.updateRecipe(id: id, body: body)
            return true
        } catch {
            errorMessage = "La recette n’a pas pu être modifiée."
            return false
        }
    }

    @discardableResult
    func deleteRecipe(id: String, using provider: any NutritionDataProvider) async -> Bool {
        do {
            try await provider.deleteRecipe(id: id)
            return true
        } catch {
            errorMessage = "La recette n’a pas pu être supprimée."
            return false
        }
    }
}

struct MealsOverviewView: View {
    @Environment(AppModel.self) private var model
    @State private var editorTarget: MealEditorTarget?
    @State private var nutritionModel = NutritionViewModel()

    var body: some View {
        ScreenScaffold(title: "Repas", context: model.activeDate.rawValue) {
            dateControls
            if model.isLoadingMeals && model.mealHistory.isEmpty {
                ContentStateView(kind: .loading("Chargement des repas…"))
            } else if let message = model.mealsErrorMessage, model.mealHistory.isEmpty {
                ContentStateView(kind: .error(message: message, retry: { Task { await model.refreshMeals() } }))
            } else {
                nutritionContent
                currentDay
                history
                provenance
            }
        }
        .task(id: model.activeDate) { await model.refreshMeals() }
        .task(id: model.activeDate) { await refreshNutrition() }
        .refreshable {
            await model.refreshMeals()
            await refreshNutrition()
        }
        .sheet(item: $editorTarget) { target in
            MealEditorView(mealType: target.type, mealID: target.mealID)
        }
    }

    @ViewBuilder
    private var nutritionContent: some View {
        if nutritionModel.isLoading && nutritionModel.snapshot == nil {
            ContentStateView(kind: .loading("Chargement des scores et tendances nutritionnels…"))
        } else if let errorMessage = nutritionModel.errorMessage, nutritionModel.snapshot == nil {
            ContentStateView(kind: .error(message: errorMessage, retry: {
                Task { await refreshNutrition() }
            }))
        } else if let snapshot = nutritionModel.snapshot {
            VStack(alignment: .leading, spacing: 12) {
                if let errorMessage = nutritionModel.errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(SomaTheme.warning)
                        .accessibilityAddTraits(.isStaticText)
                }
                NutritionParityContent(
                    snapshot: snapshot,
                    onSupplementStatusChange: { definitionID, status in
                        setSupplementStatus(definitionID: definitionID, date: snapshot.date, status: status)
                    },
                    onSupplementClear: { entryID in
                        deleteSupplementEntry(id: entryID)
                    },
                    onSupplementCreate: { body in
                        createSupplementDefinition(body)
                    },
                    onSupplementUpdate: { definitionID, body in
                        updateSupplementDefinition(id: definitionID, body: body)
                    },
                    onSupplementDelete: { definitionID in
                        deleteSupplementDefinition(id: definitionID)
                    },
                    onRecipeCreate: { body in
                        createRecipe(body)
                    },
                    onRecipeUpdate: { recipeID, body in
                        updateRecipe(id: recipeID, body: body)
                    },
                    onRecipeDelete: { recipeID in
                        deleteRecipe(id: recipeID)
                    }
                )
            }
        }
    }

    private func refreshNutrition() async {
        await nutritionModel.refresh(for: model.activeDate, using: AppModelNutritionDataProvider(model: model))
    }

    private func setSupplementStatus(definitionID: String, date: String, status: String) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.setSupplementStatus(definitionID: definitionID, date: date, status: status, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func deleteSupplementEntry(id: String) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.deleteSupplementEntry(id: id, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func createSupplementDefinition(_ body: NutritionSupplementDefinitionCreateRequest) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.createSupplementDefinition(body, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func updateSupplementDefinition(id: String, body: NutritionSupplementDefinitionUpdateRequest) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.updateSupplementDefinition(id: id, body: body, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func deleteSupplementDefinition(id: String) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.deleteSupplementDefinition(id: id, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func createRecipe(_ body: NutritionRecipeCreateRequest) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.createRecipe(body, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func updateRecipe(id: String, body: NutritionRecipeUpdateRequest) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.updateRecipe(id: id, body: body, using: provider) {
                await refreshNutrition()
            }
        }
    }

    private func deleteRecipe(id: String) {
        Task {
            let provider = AppModelNutritionDataProvider(model: model)
            if await nutritionModel.deleteRecipe(id: id, using: provider) {
                await refreshNutrition()
            }
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

private struct SupplementClearTarget: Identifiable {
    let id: String
    let name: String
}

private struct NutritionParityContent: View {
    let snapshot: NativeNutritionResponse
    let onSupplementStatusChange: (String, String) -> Void
    let onSupplementClear: (String) -> Void
    let onSupplementCreate: (NutritionSupplementDefinitionCreateRequest) -> Void
    let onSupplementUpdate: (String, NutritionSupplementDefinitionUpdateRequest) -> Void
    let onSupplementDelete: (String) -> Void
    let onRecipeCreate: (NutritionRecipeCreateRequest) -> Void
    let onRecipeUpdate: (String, NutritionRecipeUpdateRequest) -> Void
    let onRecipeDelete: (String) -> Void

    @State private var trendDays = 7
    @State private var showsScoreComponents = false
    @State private var recipeEditor: NutritionRecipe?
    @State private var isRecipeEditorPresented = false
    @State private var pendingSupplementClear: SupplementClearTarget?
    @State private var supplementEditor: NutritionSupplementDefinition?
    @State private var isSupplementEditorPresented = false
    @State private var pendingSupplementDelete: NutritionSupplementDefinition?
    @State private var pendingRecipeDelete: NutritionRecipe?

    var body: some View {
        VStack(alignment: .leading, spacing: 32) {
            scoreSection
            recentNutrition
            trends
            foodGroups
            supplements
            recipes
            provenance
        }
        .sheet(isPresented: $isRecipeEditorPresented) {
            NutritionRecipeEditor(
                recipe: recipeEditor,
                onSave: { result in
                    switch result {
                    case .create(let body):
                        onRecipeCreate(body)
                    case .update(let id, let body):
                        onRecipeUpdate(id, body)
                    }
                    isRecipeEditorPresented = false
                }
            )
        }
        .sheet(isPresented: $isSupplementEditorPresented) {
            NutritionSupplementDefinitionEditor(
                definition: supplementEditor,
                onSave: { result in
                    switch result {
                    case .create(let body):
                        onSupplementCreate(body)
                    case .update(let id, let body):
                        onSupplementUpdate(id, body)
                    }
                    isSupplementEditorPresented = false
                }
            )
        }
        .alert(item: $pendingSupplementClear) { target in
            Alert(
                title: Text("Effacer la prise ?"),
                message: Text("La prise de \(target.name) pour cette date sera supprimée."),
                primaryButton: .destructive(Text("Effacer")) {
                    onSupplementClear(target.id)
                },
                secondaryButton: .cancel(Text("Annuler"))
            )
        }
        .alert(item: $pendingRecipeDelete) { recipe in
            Alert(
                title: Text("Supprimer la recette ?"),
                message: Text("Le repère personnel « \(recipe.name) » sera supprimé."),
                primaryButton: .destructive(Text("Supprimer")) {
                    onRecipeDelete(recipe.id)
                },
                secondaryButton: .cancel(Text("Annuler"))
            )
        }
        .alert(item: $pendingSupplementDelete) { definition in
            Alert(
                title: Text("Archiver le complément ?"),
                message: Text("\(definition.productName) ne sera plus proposé pour les nouvelles prises. L’historique reste conservé."),
                primaryButton: .destructive(Text("Archiver")) {
                    onSupplementDelete(definition.id)
                },
                secondaryButton: .cancel(Text("Annuler"))
            )
        }
    }

    private var scoreSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Score alimentaire", trailing: snapshot.date)
            if let score = snapshot.score {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(score.value.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—")
                        .font(.system(.largeTitle, design: .monospaced))
                    Text("/ 100")
                        .font(.body.monospacedDigit())
                        .foregroundStyle(SomaTheme.secondary)
                    Spacer(minLength: 8)
                    Text(scoreStatus(score.status))
                        .font(.callout)
                        .foregroundStyle(score.status == "ready" ? SomaTheme.signal : SomaTheme.secondary)
                }
                Text("\(score.observedDimensions) dimensions mesurées · confiance \(score.confidence.formatted(.percent.precision(.fractionLength(0))))")
                    .font(.callout)
                    .foregroundStyle(SomaTheme.secondary)
                if !score.reasons.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Signaux")
                            .font(.headline)
                        ForEach(score.reasons, id: \.self) { reason in
                            Label(reason, systemImage: "arrow.right")
                                .font(.callout)
                        }
                    }
                }
                if !score.components.isEmpty {
                    DisclosureGroup("Dimensions du score", isExpanded: $showsScoreComponents) {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(score.components, id: \.key) { component in
                                scoreComponent(component)
                            }
                        }
                        .padding(.top, 12)
                    }
                }
            } else {
                ContentStateView(kind: .empty(title: "Score indisponible", detail: "Aucune dimension nutritionnelle mesurée pour cette date."))
            }
        }
    }

    private func scoreComponent(_ component: NutritionScoreComponent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(component.label)
                Spacer()
                Text(component.score.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—")
                    .font(.body.monospacedDigit())
            }
            Text(component.summary)
                .font(.callout)
                .foregroundStyle(SomaTheme.secondary)
            if let target = component.target {
                Text("Repère · \(target)")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
            }
            Divider().overlay(SomaTheme.rule)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var recentNutrition: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Nutrition du jour", trailing: snapshot.daily?.date ?? snapshot.date)
            if let daily = snapshot.daily {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 16)], alignment: .leading, spacing: 20) {
                    nutritionMetric("Calories", daily.caloriesKcal, "kcal", target: snapshot.targets?.effective.caloriesKcal)
                    nutritionMetric("Protéines", daily.proteinG, "g", target: snapshot.targets?.effective.proteinG)
                    nutritionMetric("Glucides", daily.carbsG, "g", target: snapshot.targets?.effective.carbsG)
                    nutritionMetric("Lipides", daily.fatG, "g", target: snapshot.targets?.effective.fatG)
                    nutritionMetric("Fibres", daily.fiberG, "g", target: snapshot.targets?.effective.fiberG)
                    nutritionMetric("Sucres ajoutés", daily.addedSugarG, "g", target: snapshot.targets?.effective.addedSugarG)
                }
                Text("\(daily.mealCount) repas confirmé(s) · couverture des créneaux \(daily.mealCoverage.formatted(.percent.precision(.fractionLength(0))))")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
            } else {
                ContentStateView(kind: .empty(title: "Aucun repas confirmé", detail: "La journée ne contient pas de mesure nutritionnelle à afficher."))
            }
        }
    }

    private var trends: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                Text("Tendances")
                    .font(.system(.title2, design: .serif))
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Picker("Période", selection: $trendDays) {
                    Text("7 j").tag(7)
                    Text("2 sem.").tag(14)
                    Text("1 mois").tag(30)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 300)
            }
            Text("Les jours sans estimation restent absents, jamais ramenés à zéro.")
                .font(.callout)
                .foregroundStyle(SomaTheme.secondary)
            if snapshot.nutritionHistory.isEmpty {
                ContentStateView(kind: .empty(title: "Tendances indisponibles", detail: "Aucune série nutritionnelle confirmée sur cette période."))
            } else {
                VStack(alignment: .leading, spacing: 24) {
                    ForEach(snapshot.nutritionHistory, id: \.id) { metric in
                        NutritionMetricBars(metric: metric, period: trendDays)
                    }
                }
            }
            NutritionScoreBars(points: snapshot.scoreTrend, period: trendDays)
        }
    }

    @ViewBuilder
    private var foodGroups: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("Familles alimentaires", trailing: "28 jours")
            FoodGroupDistributionView(points: snapshot.foodGroupHistory)
        }
    }

    @ViewBuilder
    private var supplements: some View {
        let activeDefinitions = snapshot.supplements.definitions.filter { $0.archivedAt == nil }
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Compléments")
                    .font(.system(.title2, design: .serif))
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button("Nouveau") {
                    supplementEditor = nil
                    isSupplementEditorPresented = true
                }
                .buttonStyle(.borderless)
                .font(.callout)
                .frame(minWidth: 44, minHeight: 44)
            }
            if activeDefinitions.isEmpty {
                ContentStateView(kind: .empty(title: "Aucun complément configuré", detail: "Les prises restent séparées des totaux des repas."))
            } else {
                ForEach(activeDefinitions) { definition in
                    let entry = snapshot.supplements.entries.first { $0.definitionId == definition.id }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(definition.productName)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(supplementStatus(entry?.actual.status))
                                .font(.callout)
                                .foregroundStyle(SomaTheme.secondary)
                        }
                        HStack(spacing: 8) {
                            supplementAction("Pris", status: "taken", current: entry?.actual.status, definitionID: definition.id)
                            supplementAction("Sauté", status: "skipped", current: entry?.actual.status, definitionID: definition.id)
                            if let entry {
                                Button("Effacer") {
                                    pendingSupplementClear = SupplementClearTarget(id: entry.id, name: definition.productName)
                                }
                                    .buttonStyle(.borderless)
                                    .font(.caption)
                                    .frame(minWidth: 44, minHeight: 44)
                            }
                        }
                        HStack(spacing: 12) {
                            Button("Modifier") {
                                supplementEditor = definition
                                isSupplementEditorPresented = true
                            }
                            .buttonStyle(.borderless)
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44)
                            Button("Archiver", role: .destructive) {
                                pendingSupplementDelete = definition
                            }
                            .buttonStyle(.borderless)
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44)
                        }
                    }
                    if let instruction = definition.usageInstruction, !instruction.isEmpty {
                        Text(instruction).font(.caption).foregroundStyle(SomaTheme.secondary)
                    }
                    Divider().overlay(SomaTheme.rule)
                }
            }
            Text("Les nutriments détaillés restent facultatifs ; aucune composition absente n’est déduite.")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
            NutritionWebLink(title: "Voir la configuration avancée sur Soma Web", fragment: "supplements-title")
        }
    }

    @ViewBuilder
    private var recipes: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("Recettes habituelles")
                    .font(.system(.title2, design: .serif))
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button("Nouvelle") {
                    recipeEditor = nil
                    isRecipeEditorPresented = true
                }
                .buttonStyle(.borderless)
                .font(.callout)
                .frame(minWidth: 44, minHeight: 44)
            }
            if snapshot.recipes.isEmpty {
                ContentStateView(kind: .empty(title: "Aucune recette enregistrée", detail: "Les recettes sont des repères indicatifs ; la photo et la note du jour priment."))
            } else {
                ForEach(snapshot.recipes) { recipe in
                    DisclosureGroup(recipe.name) {
                        if let description = recipe.description, !description.isEmpty {
                            Text(description).font(.callout).foregroundStyle(SomaTheme.secondary)
                        }
                        ForEach(recipe.ingredients, id: \.name) { ingredient in
                            HStack(alignment: .firstTextBaseline) {
                                Text(ingredient.name)
                                Spacer()
                                if let amount = ingredient.usualAmount {
                                    Text(amount).font(.caption.monospacedDigit()).foregroundStyle(SomaTheme.secondary)
                                }
                            }
                        }
                        HStack(spacing: 12) {
                            Button("Modifier") {
                                recipeEditor = recipe
                                isRecipeEditorPresented = true
                            }
                            .buttonStyle(.borderless)
                            .frame(minWidth: 44, minHeight: 44)
                            Button("Supprimer", role: .destructive) {
                                pendingRecipeDelete = recipe
                            }
                            .buttonStyle(.borderless)
                            .frame(minWidth: 44, minHeight: 44)
                        }
                    }
                }
            }
            Text("Les options avancées des recettes restent disponibles sur Soma Web.")
                .font(.caption)
                .foregroundStyle(SomaTheme.secondary)
            NutritionWebLink(title: "Options avancées sur Soma Web", fragment: "recipe-library-title")
        }
    }

    private var provenance: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().overlay(SomaTheme.rule)
            Text("Provenance").font(.headline)
            Text(snapshot.provenance.note)
            Text("Source · repas confirmés · calcul · Soma")
            if !snapshot.errors.isEmpty {
                ForEach(snapshot.errors) { error in
                    Text("\(error.section) · \(error.message)")
                        .foregroundStyle(SomaTheme.warning)
                }
            }
        }
        .font(.callout)
        .foregroundStyle(SomaTheme.secondary)
    }

    private func nutritionMetric(_ label: String, _ value: Double?, _ unit: String, target: NutritionTargetRange?) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption).foregroundStyle(SomaTheme.secondary)
            if let value {
                Text("\(value.formatted(.number.precision(.fractionLength(0)))) \(unit)")
                    .font(.system(.title3, design: .monospaced))
            } else {
                Text("Indisponible")
                    .font(.body)
                    .foregroundStyle(SomaTheme.secondary)
            }
            if let target {
                Text("Repère \(target.likely.formatted(.number.precision(.fractionLength(0)))) \(unit)")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func sectionHeader(_ title: String, trailing: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(.title2, design: .serif))
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
        }
    }

    private func scoreStatus(_ status: String) -> String {
        switch status {
        case "ready": return "Complet"
        case "limited": return "Partiel"
        case "insufficient": return "Insuffisant"
        default: return status
        }
    }

    private func supplementStatus(_ status: String?) -> String {
        switch status {
        case "taken": return "Pris"
        case "skipped": return "Sauté"
        case "not_recorded": return "Non renseigné"
        default: return "Non renseigné"
        }
    }

    private func supplementAction(_ title: String, status: String, current: String?, definitionID: String) -> some View {
        Button(title) {
            onSupplementStatusChange(definitionID, status)
        }
        .buttonStyle(.borderless)
        .font(.caption)
        .frame(minWidth: 44, minHeight: 44)
        .disabled(current == status)
    }
}

private enum NutritionRecipeEditorResult {
    case create(NutritionRecipeCreateRequest)
    case update(id: String, body: NutritionRecipeUpdateRequest)
}

private struct RecipeIngredientDraft: Identifiable {
    let id = UUID()
    var name: String = ""
    var varietyKey: String = ""
    var usualAmount: String = ""
    var preparation: String = ""
    var alternatives: String = ""

    init(_ ingredient: NutritionRecipeIngredient? = nil) {
        name = ingredient?.name ?? ""
        varietyKey = ingredient?.varietyKey ?? ""
        usualAmount = ingredient?.usualAmount ?? ""
        preparation = ingredient?.preparation ?? ""
        alternatives = ingredient?.alternatives.joined(separator: ", ") ?? ""
    }
}

private struct NutritionRecipeEditor: View {
    let recipe: NutritionRecipe?
    let onSave: (NutritionRecipeEditorResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var dishType: String
    @State private var description: String
    @State private var ingredientDrafts: [RecipeIngredientDraft]
    @State private var aliases: String
    @State private var commonVariations: String

    init(recipe: NutritionRecipe?, onSave: @escaping (NutritionRecipeEditorResult) -> Void) {
        self.recipe = recipe
        self.onSave = onSave
        _name = State(initialValue: recipe?.name ?? "")
        _dishType = State(initialValue: recipe?.dishType ?? "")
        _description = State(initialValue: recipe?.description ?? "")
        _ingredientDrafts = State(initialValue: recipe?.ingredients.map(RecipeIngredientDraft.init) ?? [])
        _aliases = State(initialValue: recipe?.aliases.joined(separator: ", ") ?? "")
        _commonVariations = State(initialValue: recipe?.commonVariations.joined(separator: ", ") ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Repère personnel") {
                    TextField("Nom de la recette", text: $name)
                    TextField("Type de plat (facultatif)", text: $dishType)
                    TextField("Description (facultative)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Alias séparés par des virgules", text: $aliases, axis: .vertical)
                        .lineLimit(1...3)
                    TextField("Variations séparées par des virgules", text: $commonVariations, axis: .vertical)
                        .lineLimit(1...3)
                }
                Section("Ingrédients habituels") {
                    ForEach($ingredientDrafts) { $ingredient in
                        VStack(alignment: .leading, spacing: 8) {
                            TextField("Ingrédient", text: $ingredient.name)
                            TextField("Quantité habituelle (facultative)", text: $ingredient.usualAmount)
                            TextField("Préparation (facultative)", text: $ingredient.preparation)
                            TextField("Variété (facultative)", text: $ingredient.varietyKey)
                            TextField("Alternatives séparées par des virgules", text: $ingredient.alternatives)
                            Button("Retirer cet ingrédient", role: .destructive) {
                                ingredientDrafts.removeAll { $0.id == ingredient.id }
                            }
                            .frame(minHeight: 44, alignment: .leading)
                        }
                    }
                    Button("Ajouter un ingrédient", systemImage: "plus") {
                        ingredientDrafts.append(RecipeIngredientDraft())
                    }
                    .disabled(ingredientDrafts.count >= 30)
                    .frame(minHeight: 44, alignment: .leading)
                }
                Section {
                    Text("Les quantités restent indicatives. La photo et la note du jour priment toujours pour le repas enregistré.")
                        .font(.caption)
                        .foregroundStyle(SomaTheme.secondary)
                    if hasTooManyAlternatives {
                        Text("Huit alternatives maximum par ingrédient.")
                            .font(.caption)
                            .foregroundStyle(SomaTheme.warning)
                    }
                }
            }
            .navigationTitle(recipe == nil ? "Nouvelle recette" : "Modifier la recette")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { save() }
                        .disabled(trimmedName.isEmpty || hasTooManyAlternatives || ingredientDrafts.contains { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                }
            }
        }
        .frame(minWidth: 360, minHeight: 320)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasTooManyAlternatives: Bool {
        ingredientDrafts.contains { commaSeparated($0.alternatives).count > 8 }
    }

    private var ingredientRequests: [NutritionRecipeIngredientRequest] {
        ingredientDrafts.map { ingredient in
                NutritionRecipeIngredientRequest(
                    name: ingredient.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    varietyKey: optionalText(ingredient.varietyKey),
                    usualAmount: optionalText(ingredient.usualAmount),
                    preparation: optionalText(ingredient.preparation),
                    alternatives: commaSeparated(ingredient.alternatives)
                )
            }
    }

    private func optionalText(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func commaSeparated(_ value: String) -> [String] {
        value
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func save() {
        let trimmedDishType = dishType.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let dishTypeValue = trimmedDishType.isEmpty ? nil : trimmedDishType
        let descriptionValue = trimmedDescription.isEmpty ? nil : trimmedDescription
        if let recipe {
            onSave(.update(
                id: recipe.id,
                body: NutritionRecipeUpdateRequest(
                    name: trimmedName,
                    dishType: dishTypeValue,
                    description: descriptionValue,
                    ingredients: ingredientRequests,
                    aliases: commaSeparated(aliases),
                    commonVariations: commaSeparated(commonVariations)
                )
            ))
        } else {
            onSave(.create(
                NutritionRecipeCreateRequest(
                    name: trimmedName,
                    dishType: dishTypeValue,
                    description: descriptionValue,
                    ingredients: ingredientRequests,
                    aliases: commaSeparated(aliases),
                    commonVariations: commaSeparated(commonVariations)
                )
            ))
        }
        dismiss()
    }
}

private enum NutritionSupplementEditorResult {
    case create(NutritionSupplementDefinitionCreateRequest)
    case update(id: String, body: NutritionSupplementDefinitionUpdateRequest)
}

private struct NutritionSupplementFrequencyDraft {
    var kind: String = "daily"
    var timesPerDay = "1"
    var timesPerWeek = "1"
    var daysOfWeek: Set<Int> = []
    var instructions = ""
}

private struct NutritionNutrientDraft: Identifiable {
    let id: UUID
    let originalKey: String?
    var label: String
    var amount: String
    var unit: String

    init(id: UUID = UUID(), originalKey: String? = nil, label: String = "", amount: String = "", unit: String = "g") {
        self.id = id
        self.originalKey = originalKey
        self.label = label
        self.amount = amount
        self.unit = unit
    }
}

private struct NutritionSupplementDefinitionEditor: View {
    let definition: NutritionSupplementDefinition?
    let onSave: (NutritionSupplementEditorResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var productName: String
    @State private var brand: String
    @State private var category: String
    @State private var source: String
    @State private var sourceReference: String
    @State private var quantity: String
    @State private var unit: String
    @State private var servingLabel: String
    @State private var frequency: NutritionSupplementFrequencyDraft
    @State private var usageInstruction: String
    @State private var notes: String
    @State private var nutrientDrafts: [NutritionNutrientDraft]

    private static let categories = [
        ("vitamin_mineral", "Vitamines / minéraux"),
        ("protein", "Protéines"),
        ("creatine", "Créatine"),
        ("caffeine", "Caféine"),
        ("electrolyte", "Électrolytes"),
        ("other", "Autre"),
    ]
    private static let sources = [
        ("product_label", "Étiquette produit"),
        ("manufacturer", "Fabricant"),
        ("health_professional", "Professionnel de santé"),
        ("personal_record", "Note personnelle"),
        ("other", "Autre"),
    ]
    private static let units = ["g", "mg", "mcg", "ml", "capsule", "tablet", "scoop", "sachet", "drop", "serving"]
    private static let nutrientUnits = ["g", "mg", "mcg", "iu", "kcal"]
    private static let weekdays = [
        (0, "Lun"),
        (1, "Mar"),
        (2, "Mer"),
        (3, "Jeu"),
        (4, "Ven"),
        (5, "Sam"),
        (6, "Dim"),
    ]

    init(definition: NutritionSupplementDefinition?, onSave: @escaping (NutritionSupplementEditorResult) -> Void) {
        self.definition = definition
        self.onSave = onSave
        _productName = State(initialValue: definition?.productName ?? "")
        _brand = State(initialValue: definition?.brand ?? "")
        _category = State(initialValue: definition?.category ?? Self.categories[0].0)
        _source = State(initialValue: definition?.source ?? Self.sources[0].0)
        _sourceReference = State(initialValue: definition?.sourceReference ?? "")
        _quantity = State(initialValue: definition.map { String($0.serving.quantity) } ?? "1")
        _unit = State(initialValue: definition?.serving.unit ?? "serving")
        _servingLabel = State(initialValue: definition?.serving.label ?? "1 portion")
        _frequency = State(initialValue: Self.frequencyDraft(from: definition?.frequency))
        _usageInstruction = State(initialValue: definition?.usageInstruction ?? "")
        _notes = State(initialValue: definition?.notes ?? "")
        _nutrientDrafts = State(initialValue: definition?.nutrients.map { nutrient in
            NutritionNutrientDraft(originalKey: nutrient.key, label: nutrient.label, amount: String(nutrient.amount), unit: nutrient.unit)
        } ?? [])
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Produit") {
                    TextField("Nom du produit", text: $productName)
                    TextField("Marque (facultative)", text: $brand)
                    Picker("Catégorie", selection: $category) {
                        ForEach(Self.categories, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    Picker("Source", selection: $source) {
                        ForEach(Self.sources, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    TextField("Référence source (facultative)", text: $sourceReference)
                }
                Section("Portion") {
                    TextField("Quantité", text: $quantity)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    Picker("Unité", selection: $unit) {
                        ForEach(Self.units, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Libellé de la portion", text: $servingLabel)
                }
                Section("Fréquence") {
                    Picker("Type", selection: $frequency.kind) {
                        Text("Chaque jour").tag("daily")
                        Text("Chaque semaine").tag("weekly")
                        Text("Si besoin").tag("as_needed")
                        Text("Personnalisée").tag("custom")
                    }
                    if frequency.kind == "daily" {
                        TextField("Prises par jour", text: $frequency.timesPerDay)
                    } else if frequency.kind == "weekly" {
                        TextField("Prises par semaine", text: $frequency.timesPerWeek)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Jours concernés (facultatif)")
                                .font(.subheadline)
                                .foregroundStyle(SomaTheme.secondary)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 58), spacing: 8)], spacing: 8) {
                                ForEach(Self.weekdays, id: \.0) { day in
                                    Button(day.1) {
                                        if frequency.daysOfWeek.contains(day.0) {
                                            frequency.daysOfWeek.remove(day.0)
                                        } else {
                                            frequency.daysOfWeek.insert(day.0)
                                        }
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(frequency.daysOfWeek.contains(day.0) ? SomaTheme.primary : SomaTheme.secondary)
                                    .frame(minWidth: 44, minHeight: 44)
                                    .accessibilityLabel(day.1)
                                    .accessibilityValue(frequency.daysOfWeek.contains(day.0) ? "Sélectionné" : "Non sélectionné")
                                }
                            }
                        }
                    } else {
                        TextField("Instructions", text: $frequency.instructions, axis: .vertical)
                            .lineLimit(2...4)
                    }
                }
                Section("Composition facultative") {
                    if nutrientDrafts.isEmpty {
                        Text("Aucun nutriment renseigné. Ajoute uniquement les valeurs présentes sur l’étiquette ou dans ta source.")
                            .font(.caption)
                            .foregroundStyle(SomaTheme.secondary)
                    }
                    ForEach($nutrientDrafts) { $nutrient in
                        VStack(alignment: .leading, spacing: 8) {
                            TextField("Libellé", text: $nutrient.label)
                            HStack(spacing: 8) {
                                TextField("Quantité", text: $nutrient.amount)
                                    #if os(iOS)
                                    .keyboardType(.decimalPad)
                                    #endif
                                Picker("Unité", selection: $nutrient.unit) {
                                    ForEach(Self.nutrientUnits, id: \.self) { unit in
                                        Text(unit).tag(unit)
                                    }
                                }
                                .frame(width: 100)
                            }
                            Button("Supprimer ce nutriment", role: .destructive) {
                                nutrientDrafts.removeAll { $0.id == nutrient.id }
                            }
                            .buttonStyle(.borderless)
                            .font(.caption)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                        }
                        .padding(.vertical, 4)
                    }
                    Button("Ajouter un nutriment", systemImage: "plus") {
                        nutrientDrafts.append(NutritionNutrientDraft())
                    }
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                    Text("Laisse cette section vide si la composition n’est pas connue. Aucun nutriment ne sera inventé.")
                        .font(.caption)
                        .foregroundStyle(SomaTheme.secondary)
                    if !nutrientsValid {
                        Text("Renseigne un libellé et une quantité valides pour chaque nutriment ajouté.")
                            .font(.caption)
                            .foregroundStyle(SomaTheme.warning)
                    }
                }
                Section("Repères") {
                    TextField("Conseil d’utilisation (facultatif)", text: $usageInstruction, axis: .vertical)
                        .lineLimit(2...4)
                    TextField("Notes (facultatif)", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle(definition == nil ? "Nouveau complément" : "Modifier le complément")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { save() }
                        .disabled(!canSave)
                }
            }
        }
        .frame(minWidth: 380, minHeight: 620)
    }

    private var trimmedProductName: String {
        productName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var parsedQuantity: Double? {
        Double(quantity.replacingOccurrences(of: ",", with: "."))
    }

    private var parsedNutrients: [NutritionSupplementNutrient]? {
        var usedKeys = Set<String>()
        var parsed: [NutritionSupplementNutrient] = []
        for draft in nutrientDrafts {
            let label = draft.label.trimmingCharacters(in: .whitespacesAndNewlines)
            let amountText = draft.amount.trimmingCharacters(in: .whitespacesAndNewlines)
            if label.isEmpty && amountText.isEmpty { continue }
            guard !label.isEmpty,
                  let amount = Double(amountText.replacingOccurrences(of: ",", with: ".")),
                  amount.isFinite,
                  amount >= 0,
                  Self.nutrientUnits.contains(draft.unit) else { return nil }
            let key: String
            if let originalKey = draft.originalKey, !usedKeys.contains(originalKey) {
                key = originalKey
                usedKeys.insert(originalKey)
            } else {
                key = Self.uniqueNutrientKey(for: label, usedKeys: &usedKeys)
            }
            parsed.append(NutritionSupplementNutrient(key: key, label: label, amount: amount, unit: draft.unit))
        }
        return parsed
    }

    private var nutrientsValid: Bool { parsedNutrients != nil }

    private var frequencyRequest: NutritionSupplementFrequencyRequest? {
        switch frequency.kind {
        case "daily":
            guard let value = Int(frequency.timesPerDay), (1...24).contains(value) else { return nil }
            return .init(kind: "daily", timesPerDay: value)
        case "weekly":
            guard let value = Int(frequency.timesPerWeek), (1...7).contains(value) else { return nil }
            let days = frequency.daysOfWeek.sorted()
            return .init(kind: "weekly", timesPerWeek: value, daysOfWeek: days)
        case "as_needed":
            let instructions = frequency.instructions.trimmingCharacters(in: .whitespacesAndNewlines)
            return .init(kind: "as_needed", instructions: instructions.isEmpty ? nil : instructions)
        case "custom":
            let instructions = frequency.instructions.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !instructions.isEmpty else { return nil }
            return .init(kind: "custom", instructions: instructions)
        default:
            return nil
        }
    }

    private var canSave: Bool {
        !trimmedProductName.isEmpty && parsedQuantity.map { $0 > 0 && $0.isFinite } == true && !servingLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && nutrientsValid && frequencyRequest != nil
    }

    private func save() {
        guard let amount = parsedQuantity, let frequencyRequest else { return }
        let serving = NutritionSupplementServing(quantity: amount, unit: unit, label: servingLabel.trimmingCharacters(in: .whitespacesAndNewlines))
        let common = NutritionSupplementDefinitionCreateRequest(
            productName: trimmedProductName,
            brand: optionalText(brand),
            category: category,
            source: source,
            sourceReference: optionalText(sourceReference),
            serving: serving,
            nutrients: parsedNutrients ?? [],
            frequency: frequencyRequest,
            usageInstruction: optionalText(usageInstruction),
            notes: optionalText(notes)
        )
        if let definition {
            onSave(.update(
                id: definition.id,
                body: NutritionSupplementDefinitionUpdateRequest(
                    productName: common.productName,
                    brand: common.brand,
                    category: common.category,
                    source: common.source,
                    sourceReference: common.sourceReference,
                    serving: common.serving,
                    nutrients: common.nutrients,
                    frequency: common.frequency,
                    usageInstruction: common.usageInstruction,
                    notes: common.notes
                )
            ))
        } else {
            onSave(.create(common))
        }
        dismiss()
    }

    private func optionalText(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func uniqueNutrientKey(for label: String, usedKeys: inout Set<String>) -> String {
        let folded = label.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        var key = folded.unicodeScalars.map { scalar -> Character in
            let value = scalar.value
            return (value >= 48 && value <= 57) || (value >= 97 && value <= 122) ? Character(String(scalar)) : "_"
        }
        while key.first == "_" { key.removeFirst() }
        while key.last == "_" { key.removeLast() }
        var base = String(key).lowercased()
        if base.isEmpty { base = "nutrient" }
        if let first = base.unicodeScalars.first, !(first.value >= 48 && first.value <= 57) && !(first.value >= 97 && first.value <= 122) {
            base = "nutrient_\(base)"
        }
        var candidate = base
        var suffix = 2
        while usedKeys.contains(candidate) {
            candidate = "\(base)_\(suffix)"
            suffix += 1
        }
        usedKeys.insert(candidate)
        return candidate
    }

    private static func frequencyDraft(from value: JSONValue?) -> NutritionSupplementFrequencyDraft {
        guard case .object(let object) = value,
              case .string(let kind) = object["kind"] else { return NutritionSupplementFrequencyDraft() }
        var draft = NutritionSupplementFrequencyDraft(kind: kind)
        if case .number(let number) = object["timesPerDay"] { draft.timesPerDay = String(Int(number)) }
        if case .number(let number) = object["timesPerWeek"] { draft.timesPerWeek = String(Int(number)) }
        if case .array(let days) = object["daysOfWeek"] {
            draft.daysOfWeek = Set(days.compactMap { if case .number(let number) = $0 { return Int(number) }; return nil }.filter { (0...6).contains($0) })
        }
        if case .string(let instructions) = object["instructions"] { draft.instructions = instructions }
        return draft
    }
}

private struct NutritionWebLink: View {
    let title: String
    let fragment: String

    var body: some View {
        if let url = URL(string: "https://soma-neon-phi.vercel.app/meals#\(fragment)") {
            Link(destination: url) {
                Label(title, systemImage: "arrow.up.right.square")
                    .font(.callout)
            }
            .foregroundStyle(SomaTheme.primary)
            .frame(minHeight: 44, alignment: .leading)
            .accessibilityHint("Ouvre la gestion interactive sur Soma Web")
        }
    }
}

private struct NutritionMetricBars: View {
    let metric: NutritionTrendMetric
    let period: Int

    private var points: [NutritionTrendPoint] { Array(metric.points.suffix(period)) }
    private var values: [Double] { points.compactMap(\.value) }
    private var scale: Double { max(values.max() ?? 0, 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(metricLabel)
                    .font(.headline)
                Spacer()
                Text("\(values.count)/\(points.count) jours")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
            if points.isEmpty {
                Text("Aucune mesure")
                    .font(.callout)
                    .foregroundStyle(SomaTheme.secondary)
            } else {
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(points, id: \.date) { point in
                        VStack {
                            Spacer(minLength: 0)
                            if let value = point.value {
                                Rectangle()
                                    .fill(SomaTheme.primary.opacity(0.82))
                                    .frame(height: max(value == 0 ? 2 : 4, 108 * value / scale))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 112)
                        .accessibilityLabel(point.value.map { "\(point.date), \($0.formatted(.number.precision(.fractionLength(0))))" } ?? "\(point.date), aucune mesure")
                    }
                }
                .accessibilityElement(children: .combine)
                HStack {
                    Text(points.first?.date ?? "—")
                    Spacer()
                    Text(points.last?.date ?? "—")
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(SomaTheme.secondary)
            }
        }
    }

    private var metricLabel: String {
        switch metric.id {
        case "caloriesKcal": return "Calories"
        case "proteinG": return "Protéines"
        case "addedSugarG": return "Sucres ajoutés"
        case "fatG": return "Lipides"
        case "carbsG": return "Glucides"
        default: return metric.id
        }
    }
}

private struct NutritionScoreBars: View {
    let points: [NutritionScoreTrendPoint]
    let period: Int

    private var visiblePoints: [NutritionScoreTrendPoint] { Array(points.suffix(period)) }
    private var values: [Double] { visiblePoints.compactMap(\.value) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Évolution du score")
                    .font(.headline)
                Spacer()
                Text("\(values.count)/\(visiblePoints.count) jours")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(SomaTheme.secondary)
            }
            if visiblePoints.isEmpty {
                Text("Aucune mesure")
                    .font(.callout)
                    .foregroundStyle(SomaTheme.secondary)
            } else {
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(visiblePoints, id: \.date) { point in
                        VStack {
                            Spacer(minLength: 0)
                            if let value = point.value {
                                Rectangle()
                                    .fill(point.status == "ready" ? SomaTheme.signal : SomaTheme.primary.opacity(0.7))
                                    .frame(height: max(value == 0 ? 2 : 4, 108 * max(0, min(value, 100)) / 100))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 112)
                        .accessibilityLabel(point.value.map { "\(point.date), score \($0.formatted(.number.precision(.fractionLength(0)))) sur 100" } ?? "\(point.date), score indisponible")
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct FoodGroupDistributionView: View {
    let points: [NutritionFoodGroupPoint]

    private var totals: [(key: String, value: Int)] {
        var values: [String: Int] = [:]
        for point in points {
            for (key, value) in point.counts ?? [:] where value > 0 {
                values[key, default: 0] += value
            }
        }
        return values.sorted { $0.value > $1.value }.prefix(8).map { $0 }
    }

    var body: some View {
        if totals.isEmpty {
            ContentStateView(kind: .empty(title: "Familles indisponibles", detail: "Aucune famille alimentaire classifiée sur cette période."))
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text("Occurrences classifiées · les familles peuvent se recouper")
                    .font(.callout)
                    .foregroundStyle(SomaTheme.secondary)
                let maxValue = max(totals.first?.value ?? 1, 1)
                ForEach(totals, id: \.key) { item in
                    HStack(spacing: 12) {
                        Text(foodGroupLabel(item.key))
                            .frame(width: 120, alignment: .leading)
                        ProgressView(value: Double(item.value), total: Double(maxValue))
                            .tint(SomaTheme.primary)
                        Text("\(item.value)")
                            .font(.body.monospacedDigit())
                            .frame(width: 28, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func foodGroupLabel(_ key: String) -> String {
        switch key {
        case "fruit": return "Fruits"
        case "vegetable": return "Légumes"
        case "legume": return "Légumineuses"
        case "whole_grain": return "Céréales complètes"
        case "refined_grain": return "Céréales raffinées"
        case "potato": return "Pommes de terre"
        case "animal_protein": return "Protéines animales"
        case "plant_protein": return "Protéines végétales"
        case "egg": return "Œufs"
        case "dairy": return "Produits laitiers"
        case "nuts_seeds": return "Noix et graines"
        case "added_fat": return "Matières grasses"
        case "sauce": return "Sauces"
        case "sweet": return "Produits sucrés"
        case "beverage": return "Boissons"
        default: return "Autres"
        }
    }
}
