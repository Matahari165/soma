import Foundation
import Observation
import SomaCore
#if os(iOS)
import UIKit
#endif

@MainActor
@Observable
final class AppModel {
    enum Destination: String, CaseIterable, Identifiable {
        case day = "Jour"
        case analysis = "Strongest Effects"
        case settings = "Réglages"
        case health = "Santé"
        case export = "Export"

        static var allCases: [Destination] {
            #if os(iOS)
            [.day, .analysis, .health, .export, .settings]
            #else
            [.day, .analysis, .export, .settings]
            #endif
        }

        var id: Self { self }
    }

    var destination: Destination = .day
    var activeDate: LocalDate
    var day: NativeDayResponse?
    var matrix: NativeMatrixResponse?
    var recovery: NativeRecoveryResponse?
    var currentSession: DeviceSession?
    var deviceSessions: [DeviceSession] = []
    var mealDrafts: [MealType: MealDraft] = [:]
    var mealHistory: [Meal] = []
    var mealDetails: [String: Meal] = [:]
    var isLoadingMeals = false
    var mealsErrorMessage: String?
    var isAuthenticated = false
    var isBootstrapping = true
    var isLoading = false
    var isRecoveryLoading = false
    var errorMessage: String?
    var recoveryErrorMessage: String?
    var sessionsErrorMessage: String?
    var isLoadingSessions = false
    var revokingSessionIDs: Set<String> = []

    private let client: APIClient
    private let mealDraftStore: MealDraftStore?
    private let mealCoordinator: MealSubmissionCoordinator?
    private var dayRequestGeneration = 0
    private var journalSaveGeneration = 0
    private var sessionsRequestGeneration = 0
    private var authenticationGeneration = 0

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
            if ProcessInfo.processInfo.arguments.contains("--preview-settings") {
                destination = .settings
            } else if ProcessInfo.processInfo.arguments.contains("--health-preview") {
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
            let deviceName = UIDevice.current.name
            #endif
            let context = try await client.login(email: email, password: password, platform: platform, deviceName: deviceName)
            authenticationGeneration += 1
            isAuthenticated = true
            currentSession = context.session
            try await refreshDay()
            await restoreMealDrafts()
        }
    }

    func restoreSession() async {
        guard !ProcessInfo.processInfo.arguments.contains("--preview-data") else { return }
        defer { isBootstrapping = false }
        do {
            guard try await client.hasAuthenticationToken() else {
                isAuthenticated = false
                return
            }
            let context = try await client.sessionContext()
            authenticationGeneration += 1
            currentSession = context.session
            isAuthenticated = true
            try await refreshDay()
            await restoreMealDrafts()
        } catch APIError.unauthorized {
            expireLocalSession()
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
        let generation = authenticationGeneration
        await perform {
            let response = try await client.matrix(period: "30")
            if generation == authenticationGeneration, isAuthenticated { matrix = response }
        }
    }

    func refreshSessions() async {
        guard !ProcessInfo.processInfo.arguments.contains("--preview-data") else { return }
        sessionsRequestGeneration += 1
        let generation = sessionsRequestGeneration
        isLoadingSessions = true
        sessionsErrorMessage = nil
        defer { if generation == sessionsRequestGeneration { isLoadingSessions = false } }
        do {
            async let context = client.sessionContext()
            async let sessions = client.deviceSessions()
            let (newContext, newSessions) = try await (context, sessions)
            guard generation == sessionsRequestGeneration else { return }
            currentSession = newContext.session
            deviceSessions = newSessions
        } catch APIError.unauthorized {
            guard generation == sessionsRequestGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == sessionsRequestGeneration else { return }
            sessionsErrorMessage = "Les appareils n’ont pas pu être chargés."
        }
    }

    func revokeSession(_ session: DeviceSession) async {
        guard session.id != currentSession?.id, !revokingSessionIDs.contains(session.id) else { return }
        revokingSessionIDs.insert(session.id)
        sessionsErrorMessage = nil
        defer { revokingSessionIDs.remove(session.id) }
        do {
            try await client.revokeDeviceSession(id: session.id)
            deviceSessions.removeAll { $0.id == session.id }
        } catch APIError.unauthorized {
            expireLocalSession()
        } catch {
            sessionsErrorMessage = "Cet appareil n’a pas pu être déconnecté. Réessaie."
        }
    }

    func refreshRecovery() async {
        let generation = authenticationGeneration
        isRecoveryLoading = true
        recoveryErrorMessage = nil
        defer { isRecoveryLoading = false }
        do {
            let response = try await client.recovery()
            guard generation == authenticationGeneration, isAuthenticated else { return }
            recovery = response
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration else { return }
            recoveryErrorMessage = "Les données de récupération n’ont pas pu être chargées."
        }
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
            expireLocalSession()
        } catch {
            if activeDate == shifted { errorMessage = "Cette journée n'a pas pu être chargée." }
        }
    }

    func openMeal(_ type: MealType, mealID: String? = nil) async {
        let generation = authenticationGeneration
        let resolvedID = mealID ?? mealSummary(type)?.id
        if let resolvedID, mealDetails[resolvedID] == nil {
            do {
                let meal = try await client.meal(id: resolvedID)
                guard generation == authenticationGeneration, isAuthenticated else { return }
                mealDetails[resolvedID] = meal
            } catch APIError.unauthorized {
                guard generation == authenticationGeneration else { return }
                expireLocalSession()
                return
            } catch {
                guard generation == authenticationGeneration else { return }
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
        let generation = authenticationGeneration
        isLoadingMeals = true
        mealsErrorMessage = nil
        defer { if generation == authenticationGeneration { isLoadingMeals = false } }
        do {
            let start = try activeDate.adding(days: -(max(days, 1) - 1))
            let meals = try await client.meals(from: start, to: activeDate)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealHistory = meals.sorted {
                if $0.mealDate == $1.mealDate { return $0.mealType.sortOrder < $1.mealType.sortOrder }
                return $0.mealDate > $1.mealDate
            }
            for meal in meals { mealDetails[meal.id] = meal }
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration else { return }
            mealsErrorMessage = "L’historique des repas n’a pas pu être chargé."
        }
    }

    func updateRemotePhotoOrigin(_ origin: MealPhotoOrigin, mealID: String, photoID: String) async {
        let generation = authenticationGeneration
        do {
            _ = try await client.updateMealPhotoOrigin(mealID: mealID, photoID: photoID, origin: origin)
            let meal = try await client.meal(id: mealID)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealDetails[mealID] = meal
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration else { return }
            mealsErrorMessage = "La provenance de la photo n’a pas pu être enregistrée."
        }
    }

    func deleteRemotePhoto(mealID: String, photoID: String) async {
        let generation = authenticationGeneration
        do {
            try await client.deleteMealPhoto(mealID: mealID, photoID: photoID)
            let meal = try await client.meal(id: mealID)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealDetails[mealID] = meal
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration else { return }
            mealsErrorMessage = "La photo n’a pas pu être supprimée."
        }
    }

    func deleteMeal(_ meal: Meal) async -> Bool {
        let generation = authenticationGeneration
        do {
            try await client.deleteMeal(id: meal.id)
            guard generation == authenticationGeneration, isAuthenticated else { return false }
            mealHistory.removeAll { $0.id == meal.id }
            mealDetails[meal.id] = nil
            if mealDrafts[meal.mealType]?.remoteMealId == meal.id {
                if let draft = mealDrafts[meal.mealType] { try? await mealDraftStore?.remove(draft.id) }
                mealDrafts[meal.mealType] = nil
            }
            try? await refreshDay()
            return true
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return false }
            expireLocalSession()
            return false
        } catch {
            guard generation == authenticationGeneration else { return false }
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
        await submitMeal(type)
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
        let generation = authenticationGeneration
        do {
            var current = try await coordinator.submit(draft)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealDrafts[type] = current
            while current.stage == .polling {
                try await Task.sleep(for: .seconds(2))
                current = try await coordinator.refresh(current)
                guard generation == authenticationGeneration, isAuthenticated else { return }
                mealDrafts[type] = current
            }
            if current.stage == .completed {
                try? await refreshDay()
                if let mealID = current.remoteMealId, let detail = try? await client.meal(id: mealID) {
                    guard generation == authenticationGeneration, isAuthenticated else { return }
                    mealDetails[mealID] = detail
                }
                await refreshMeals()
            }
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration, isAuthenticated else { return }
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
        authenticationGeneration += 1
        dayRequestGeneration += 1
        journalSaveGeneration += 1
        sessionsRequestGeneration += 1
        isLoading = true
        errorMessage = nil
        do { try await client.logout() }
        catch { errorMessage = "La session locale est fermée. La déconnexion distante n’a pas pu être confirmée." }
        isAuthenticated = false
        day = nil
        matrix = nil
        recovery = nil
        currentSession = nil
        deviceSessions = []
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
            expireLocalSession()
        } catch {
            errorMessage = "Soma est momentanément indisponible."
        }
    }

    private func expireLocalSession() {
        authenticationGeneration += 1
        dayRequestGeneration += 1
        journalSaveGeneration += 1
        sessionsRequestGeneration += 1
        isAuthenticated = false
        currentSession = nil
        deviceSessions = []
        day = nil
        matrix = nil
        recovery = nil
        mealDrafts = [:]
        mealHistory = []
        mealDetails = [:]
        isLoadingMeals = false
        isLoadingSessions = false
        errorMessage = "La session a expiré. Reconnecte-toi."
    }

    private func loadSyntheticPreview() {
        authenticationGeneration += 1
        isAuthenticated = true
        day = try? JSONDecoder().decode(NativeDayResponse.self, from: Data(Self.previewDay.utf8))
        matrix = try? JSONDecoder().decode(NativeMatrixResponse.self, from: Data(Self.previewMatrix.utf8))
        mealHistory = (try? JSONDecoder().decode(MealListResponse.self, from: Data(Self.previewMeals.utf8)).meals) ?? []
        for meal in mealHistory { mealDetails[meal.id] = meal }
        recovery = try? JSONDecoder().decode(NativeRecoveryResponse.self, from: Data(Self.previewRecovery.utf8))
        let now = Date()
        let previewCurrentSession = DeviceSession(id: "preview-current", platform: Self.previewPlatform, deviceName: Self.previewDeviceName, createdAt: now.addingTimeInterval(-86_400), expiresAt: now.addingTimeInterval(2_505_600))
        currentSession = previewCurrentSession
        deviceSessions = [
            previewCurrentSession,
            DeviceSession(id: "preview-other", platform: .web, deviceName: "Safari sur MacBook Air", createdAt: now.addingTimeInterval(-604_800), expiresAt: now.addingTimeInterval(1_987_200)),
        ]
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
    private static let previewRecovery = #"{"timezone":"Europe/Zurich","periodDays":30,"latestDate":"2026-09-19","freshness":{"measuredAt":"2026-09-19T07:10:00.000Z","importedAt":"2026-09-19T08:02:00.000Z","state":"current","coverage":1},"score":{"value":74,"reason":null,"average":69.4,"measuredDays":26,"coverage":1,"algorithmVersion":"recovery-v1","components":{"hrv":{"value":78,"weight":0.4},"restingHeartRate":{"value":72,"weight":0.3},"sleep":{"value":70,"weight":0.3}}},"signals":{"hrv":{"current":57,"reference":51.8,"measuredDays":27,"unit":"ms"},"restingHeartRate":{"current":56,"reference":59.2,"measuredDays":29,"unit":"bpm"}},"trends":{"hrv":[{"date":"2026-09-12","value":48},{"date":"2026-09-13","value":51},{"date":"2026-09-14","value":null},{"date":"2026-09-15","value":53},{"date":"2026-09-16","value":50},{"date":"2026-09-17","value":55},{"date":"2026-09-18","value":54},{"date":"2026-09-19","value":57}],"restingHeartRate":[{"date":"2026-09-12","value":61},{"date":"2026-09-13","value":60},{"date":"2026-09-14","value":null},{"date":"2026-09-15","value":59},{"date":"2026-09-16","value":58},{"date":"2026-09-17","value":58},{"date":"2026-09-18","value":57},{"date":"2026-09-19","value":56}]},"provenance":{"measurements":{"kind":"health_source","label":"Sources santé importées"},"score":{"kind":"soma_calculation","label":"Calcul Soma"}}}"#

    #if os(macOS)
    private static let previewPlatform: SessionPlatform = .macos
    private static let previewDeviceName = "MacBook Air"
    #else
    private static let previewPlatform: SessionPlatform = .ios
    private static let previewDeviceName = "iPhone"
    #endif
}
