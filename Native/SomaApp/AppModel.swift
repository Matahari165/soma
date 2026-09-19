import Foundation
import Observation
import SomaCore

@MainActor
@Observable
final class AppModel {
    enum Destination: String, CaseIterable, Identifiable {
        case day = "Jour"
        case analysis = "Strongest Effects"
        case health = "Santé"
        case export = "Export"

        static var allCases: [Destination] {
            #if os(iOS)
            [.day, .analysis, .health, .export]
            #else
            [.day, .analysis, .export]
            #endif
        }

        var id: Self { self }
    }

    var destination: Destination = .day
    var activeDate: LocalDate
    var day: NativeDayResponse?
    var matrix: NativeMatrixResponse?
    var mealDrafts: [MealType: MealDraft] = [:]
    var mealHistory: [Meal] = []
    var mealDetails: [String: Meal] = [:]
    var isLoadingMeals = false
    var mealsErrorMessage: String?
    var isAuthenticated = false
    var isBootstrapping = true
    var isLoading = false
    var errorMessage: String?

    private let client: APIClient
    private let mealDraftStore: MealDraftStore?
    private let mealCoordinator: MealSubmissionCoordinator?
    private var dayRequestGeneration = 0
    private var journalSaveGeneration = 0

    init() {
        activeDate = (try? LocalDate.today()) ?? (try! LocalDate("2026-09-19"))
        let client = APIClient(
            baseURL: URL(string: "https://soma-neon-phi.vercel.app")!,
            tokenStore: KeychainTokenStore()
        )
        self.client = client
        let store = try? MealDraftStore()
        mealDraftStore = store
        mealCoordinator = store.map { MealSubmissionCoordinator(api: client, store: $0) }
        if ProcessInfo.processInfo.arguments.contains("--preview-data") {
            loadSyntheticPreview()
            if ProcessInfo.processInfo.arguments.contains("--health-preview") {
                destination = .health
            } else if ProcessInfo.processInfo.arguments.contains("--preview-meals") {
                destination = .day
            } else if ProcessInfo.processInfo.arguments.contains("--preview-export") {
                destination = .export
            }
            isBootstrapping = false
        }
    }

    func login(email: String, password: String) async {
        await perform {
            #if os(macOS)
            let platform = "macos"
            let deviceName = Host.current().localizedName ?? "Mac"
            #else
            let platform = "ios"
            let deviceName = "iPhone"
            #endif
            _ = try await client.login(email: email, password: password, platform: platform, deviceName: deviceName)
            isAuthenticated = true
            try await refreshDay()
            await restoreMealDrafts()
        }
    }

    func restoreSession() async {
        guard !ProcessInfo.processInfo.arguments.contains("--preview-data") else { return }
        defer { isBootstrapping = false }
        do {
            _ = try await client.currentSession()
            isAuthenticated = true
            try await refreshDay()
            await restoreMealDrafts()
        } catch APIError.unauthorized {
            isAuthenticated = false
        } catch {
            errorMessage = "Soma est momentanément indisponible."
        }
    }

    func refreshDay() async throws {
        dayRequestGeneration += 1
        let generation = dayRequestGeneration
        let requestedDate = activeDate
        let response = try await client.day(requestedDate)
        if generation == dayRequestGeneration, activeDate == requestedDate, response.date == requestedDate.rawValue {
            day = response
        }
    }

    func refreshAnalysis() async {
        await perform { matrix = try await client.matrix(period: "30") }
    }

    func shiftDate(by days: Int) async {
        guard let shifted = try? activeDate.adding(days: days) else { return }
        activeDate = shifted
        day = nil
        dayRequestGeneration += 1
        let generation = dayRequestGeneration
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await client.day(shifted)
            if generation == dayRequestGeneration, activeDate == shifted, response.date == shifted.rawValue {
                day = response
                await restoreMealDrafts()
            }
        } catch APIError.unauthorized {
            isAuthenticated = false
            errorMessage = "La session a expiré. Reconnecte-toi."
        } catch {
            if activeDate == shifted { errorMessage = "Cette journée n'a pas pu être chargée." }
        }
    }

    func openMeal(_ type: MealType, mealID: String? = nil) async {
        let resolvedID = mealID ?? mealSummary(type)?.id
        if let resolvedID, mealDetails[resolvedID] == nil {
            do {
                mealDetails[resolvedID] = try await client.meal(id: resolvedID)
            } catch APIError.unauthorized {
                isAuthenticated = false
                errorMessage = "La session a expiré. Reconnecte-toi."
                return
            } catch {
                mealsErrorMessage = "Ce repas n’a pas pu être chargé."
                return
            }
        }
        let summary = mealSummary(type)
        let detail = resolvedID.flatMap { mealDetails[$0] }
        let draftDate = detail?.mealDate ?? activeDate.rawValue
        if mealDrafts[type]?.remoteMealId != resolvedID || mealDrafts[type]?.mealDate != draftDate {
            var draft = MealDraft(
                mealDate: draftDate,
                mealType: type,
                note: detail?.note ?? summary?.note,
                entryState: detail?.entryState ?? (summary?.entryState == "skipped" ? .skipped : .recorded),
                mouthWarmthIntensity: detail?.mouthWarmthIntensity,
                stomachOverfullIntensity: detail?.stomachOverfullIntensity
            )
            draft.remoteMealId = resolvedID
            mealDrafts[type] = draft
            await persistMealDraft(type)
        }
    }

    func refreshMeals(days: Int = 28) async {
        guard !ProcessInfo.processInfo.arguments.contains("--preview-data") else { return }
        isLoadingMeals = true
        mealsErrorMessage = nil
        defer { isLoadingMeals = false }
        do {
            let start = try activeDate.adding(days: -(max(days, 1) - 1))
            let meals = try await client.meals(from: start, to: activeDate)
            mealHistory = meals.sorted {
                if $0.mealDate == $1.mealDate { return $0.mealType.sortOrder < $1.mealType.sortOrder }
                return $0.mealDate > $1.mealDate
            }
            for meal in meals { mealDetails[meal.id] = meal }
        } catch APIError.unauthorized {
            isAuthenticated = false
            errorMessage = "La session a expiré. Reconnecte-toi."
        } catch {
            mealsErrorMessage = "L’historique des repas n’a pas pu être chargé."
        }
    }

    func updateRemotePhotoOrigin(_ origin: MealPhotoOrigin, mealID: String, photoID: String) async {
        do {
            _ = try await client.updateMealPhotoOrigin(mealID: mealID, photoID: photoID, origin: origin)
            mealDetails[mealID] = try await client.meal(id: mealID)
        } catch {
            mealsErrorMessage = "La provenance de la photo n’a pas pu être enregistrée."
        }
    }

    func deleteRemotePhoto(mealID: String, photoID: String) async {
        do {
            try await client.deleteMealPhoto(mealID: mealID, photoID: photoID)
            mealDetails[mealID] = try await client.meal(id: mealID)
        } catch {
            mealsErrorMessage = "La photo n’a pas pu être supprimée."
        }
    }

    func deleteMeal(_ meal: Meal) async -> Bool {
        do {
            try await client.deleteMeal(id: meal.id)
            mealHistory.removeAll { $0.id == meal.id }
            mealDetails[meal.id] = nil
            if mealDrafts[meal.mealType]?.remoteMealId == meal.id {
                if let draft = mealDrafts[meal.mealType] { try? await mealDraftStore?.remove(draft.id) }
                mealDrafts[meal.mealType] = nil
            }
            try? await refreshDay()
            return true
        } catch {
            mealsErrorMessage = "Le repas n’a pas pu être supprimé. Une analyse en cours doit d’abord se terminer."
            return false
        }
    }

    func setMealNote(_ note: String, for type: MealType) async {
        guard var draft = mealDrafts[type] else { return }
        draft.note = String(note.prefix(500))
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func setMealSkipped(_ skipped: Bool, for type: MealType) async {
        guard var draft = mealDrafts[type] else { return }
        draft.entryState = skipped ? .skipped : .recorded
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func addMealPhoto(sourceURL: URL, filename: String, mimeType: String, to type: MealType) async throws {
        guard var draft = mealDrafts[type], draft.photos.count < 6 else { return }
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "Soma/MealDraftPhotos/\(draft.id.uuidString.lowercased())", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let ext = sourceURL.pathExtension.isEmpty ? (mimeType == "image/png" ? "png" : "jpg") : sourceURL.pathExtension.lowercased()
        let destination = base.appending(path: "\(UUID().uuidString.lowercased()).\(ext)")
        try FileManager.default.copyItem(at: sourceURL, to: destination)
        draft.photos.append(MealDraftPhoto(fileURL: destination, filename: filename, mimeType: mimeType, origin: .unknown))
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func setPhotoOrigin(_ origin: MealPhotoOrigin, photoID: UUID, for type: MealType) async {
        guard var draft = mealDrafts[type], let index = draft.photos.firstIndex(where: { $0.id == photoID }) else { return }
        draft.photos[index].origin = origin
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func removeMealPhoto(_ photoID: UUID, from type: MealType) async {
        guard var draft = mealDrafts[type], let photo = draft.photos.first(where: { $0.id == photoID }) else { return }
        try? FileManager.default.removeItem(at: photo.fileURL)
        draft.photos.removeAll { $0.id == photoID }
        draft.uploadedPhotoDraftIDs.remove(photoID)
        draft.stage = .local
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func submitMeal(_ type: MealType) async {
        guard let coordinator = mealCoordinator, let draft = mealDrafts[type] else { return }
        do {
            var current = try await coordinator.submit(draft)
            mealDrafts[type] = current
            while current.stage == .polling {
                try await Task.sleep(for: .seconds(2))
                current = try await coordinator.refresh(current)
                mealDrafts[type] = current
            }
            if current.stage == .completed {
                try? await refreshDay()
                if let mealID = current.remoteMealId, let detail = try? await client.meal(id: mealID) {
                    mealDetails[mealID] = detail
                }
                await refreshMeals()
            }
        } catch APIError.unauthorized {
            isAuthenticated = false
            errorMessage = "La session a expiré. Reconnecte-toi."
        } catch {
            if let restored = try? await mealDraftStore?.load(draft.id) { mealDrafts[type] = restored }
        }
    }

    private func restoreMealDrafts() async {
        guard let drafts = try? await mealDraftStore?.loadAll() else { return }
        mealDrafts = drafts
            .filter { $0.mealDate == activeDate.rawValue }
            .reduce(into: [:]) { result, draft in result[draft.mealType] = draft }
    }

    private func persistMealDraft(_ type: MealType) async {
        guard let draft = mealDrafts[type] else { return }
        try? await mealDraftStore?.save(draft)
    }

    private func mealSummary(_ type: MealType) -> MealSummary? {
        guard let meals = day?.meals else { return nil }
        switch type {
        case .breakfast: return meals.breakfast
        case .lunch: return meals.lunch
        case .dinner: return meals.dinner
        case .snack: return meals.snack
        }
    }

    func saveJournal(values: [String: String]) async {
        guard let currentDay = day else { return }
        journalSaveGeneration += 1
        let generation = journalSaveGeneration
        let requestedDate = activeDate
        let entries = currentDay.variables.filter { $0.isActive && $0.captureMode != "automatic" }.map { variable in
            JournalSaveEntry(variableId: variable.id, value: Self.journalValue(values[variable.id] ?? "", type: variable.variableType))
        }
        await perform {
            let response = try await client.saveJournal(JournalSaveRequest(entryDate: requestedDate.rawValue, entries: entries))
            if generation == journalSaveGeneration, requestedDate == activeDate, response.date == requestedDate.rawValue { day = response }
        }
    }

    func logout() async {
        isLoading = true
        errorMessage = nil
        do { try await client.logout() }
        catch { errorMessage = "La session locale est fermée. La révocation distante sera retentée plus tard." }
        isAuthenticated = false
        day = nil
        matrix = nil
        mealDrafts = [:]
        mealHistory = []
        mealDetails = [:]
        isLoading = false
    }

    private func perform(_ operation: () async throws -> Void) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do { try await operation() }
        catch APIError.unauthorized {
            isAuthenticated = false
            errorMessage = "La session a expiré. Reconnecte-toi."
        } catch {
            errorMessage = "Soma est momentanément indisponible."
        }
    }

    private func loadSyntheticPreview() {
        isAuthenticated = true
        day = try? JSONDecoder().decode(NativeDayResponse.self, from: Data(Self.previewDay.utf8))
        matrix = try? JSONDecoder().decode(NativeMatrixResponse.self, from: Data(Self.previewMatrix.utf8))
        mealHistory = (try? JSONDecoder().decode(MealListResponse.self, from: Data(Self.previewMeals.utf8)).meals) ?? []
        for meal in mealHistory { mealDetails[meal.id] = meal }
    }

    private static func journalValue(_ text: String, type: String) -> JSONValue {
        guard !text.isEmpty else { return .null }
        if type == "boolean" { return .bool(text == "true") }
        if ["number", "count", "duration", "scale"].contains(type), let number = Double(text) { return .number(number) }
        return .string(text)
    }

    private static let previewDay = #"{"date":"2026-09-19","timezone":"Europe/Zurich","journal":{"variables":[{"id":"focus","name":"Concentration","variableType":"number","unit":"/10","options":[],"isActive":true,"captureMode":"manual","automaticMetricId":null},{"id":"walk","name":"Marche","variableType":"number","unit":"min","options":[],"isActive":true,"captureMode":"manual","automaticMetricId":null},{"id":"meditation","name":"Méditation","variableType":"boolean","unit":null,"options":[],"isActive":true,"captureMode":"manual","automaticMetricId":null}],"entries":[{"variableId":"focus","entryDate":"2026-09-19","value":0},{"variableId":"meditation","entryDate":"2026-09-19","value":false}],"day":{"entryDate":"2026-09-19","status":"draft","omittedVariableIds":["walk"]}},"meals":{"breakfast":null,"lunch":{"id":"meal-lunch","mealDate":"2026-09-19","mealType":"lunch","status":"draft","entryState":"skipped","note":null},"dinner":null,"snack":null}}"#
    private static let previewMatrix = #"{"rows":[{"id":"walk","label":"Marche","relations":[{"predictorId":"walk","outcomeId":"sleep","predictorLabel":"Marche","outcomeLabel":"Sommeil","effect":0.34,"sampleSize":24,"effectConfidenceLow":0.11,"effectConfidenceHigh":0.57}]},{"id":"late-meal","label":"Repas tardif","relations":[{"predictorId":"late-meal","outcomeId":"recovery","predictorLabel":"Repas tardif","outcomeLabel":"Récupération","effect":-0.28,"sampleSize":21,"effectConfidenceLow":-0.49,"effectConfidenceHigh":-0.07}]}],"outcomes":[{"id":"sleep","label":"Sommeil","unit":"score"},{"id":"recovery","label":"Récupération","unit":"score"}],"periods":[30]}"#
    private static let previewMeals = #"{"meals":[{"id":"meal-dinner","mealDate":"2026-09-19","mealType":"dinner","note":"Riz, légumes et tofu","status":"confirmed","entryState":"recorded","mouthWarmthIntensity":0,"stomachOverfullIntensity":null,"createdAt":"2026-09-19T18:00:00Z","updatedAt":"2026-09-19T18:05:00Z","photos":[{"id":"photo-dinner","mealId":"meal-dinner","origin":"homemade","mimeType":"image/jpeg","bytes":120000,"filename":"diner.jpg","createdAt":"2026-09-19T18:00:00Z","storageStatus":"purged","purgedAt":"2026-09-19T18:05:00Z","url":null}],"analysis":{"id":"analysis-dinner","mealId":"meal-dinner","status":"completed","provider":"synthetic","model":"synthetic","result":{"summary":"Repas varié avec une source de protéines végétales.","dishType":"Plat complet","calorieAnalysis":null,"foods":[{"name":"Riz","preparation":"cuit","portion":"1 bol","confidence":"high"},{"name":"Tofu et légumes","preparation":null,"portion":"1 portion","confidence":"medium"}],"totals":{"calories":{"low":480,"likely":560,"high":650},"proteinGrams":{"low":20,"likely":25,"high":31},"carbohydrateGrams":{"low":65,"likely":74,"high":86},"fatGrams":{"low":14,"likely":18,"high":24},"fiberGrams":{"low":8,"likely":11,"high":15},"sugarGrams":null,"addedSugarGrams":null},"confidence":"medium","uncertainties":["Quantité d’huile non précisée"]},"error":null,"errorCode":null,"sourcePhotoIds":["photo-dinner"],"createdAt":"2026-09-19T18:00:00Z","completedAt":"2026-09-19T18:05:00Z"},"lastSuccessfulAnalysis":null},{"id":"meal-lunch","mealDate":"2026-09-19","mealType":"lunch","note":null,"status":"draft","entryState":"skipped","mouthWarmthIntensity":null,"stomachOverfullIntensity":null,"createdAt":"2026-09-19T12:00:00Z","updatedAt":"2026-09-19T12:00:00Z","photos":[],"analysis":null,"lastSuccessfulAnalysis":null},{"id":"meal-yesterday","mealDate":"2026-09-18","mealType":"breakfast","note":"Yaourt et fruits","status":"draft","entryState":"recorded","mouthWarmthIntensity":null,"stomachOverfullIntensity":null,"createdAt":"2026-09-18T07:00:00Z","updatedAt":"2026-09-18T07:00:00Z","photos":[],"analysis":{"id":"analysis-yesterday","mealId":"meal-yesterday","status":"running","provider":"synthetic","model":"synthetic","result":null,"error":null,"errorCode":null,"sourcePhotoIds":[],"createdAt":"2026-09-18T07:00:00Z","completedAt":null},"lastSuccessfulAnalysis":null}]}"#
}
