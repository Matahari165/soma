import Foundation
import Observation
import SomaCore
#if os(iOS)
import UIKit
#endif

@MainActor
@Observable
final class AppModel {
    enum JournalSaveState: Equatable {
        case idle
        case saving
        case saved
        case failed(String)
    }
    enum EffortState {
        case idle
        case loading
        case loaded(EffortSnapshot)
        case failed(String)
    }
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
    var journalDraft: JournalDraft?
    var journalSaveState: JournalSaveState = .idle
    var journalMutationIDs: Set<String> = []
    var journalMutationErrorMessage: String?
    var matrix: NativeMatrixResponse?
    var analysisPeriod = "30"
    var loadedAnalysisPeriod: String?
    var isAnalysisLoading = false
    var analysisErrorMessage: String?
    var sleep: NativeSleepResponse?
    var isSleepLoading = false
    var sleepErrorMessage: String?
    var recovery: NativeRecoveryResponse?
    var currentUser: SessionUser?
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
    var effortState: EffortState = .idle
    var recoveryErrorMessage: String?
    var sessionsErrorMessage: String?
    var isLoadingSessions = false
    var revokingSessionIDs: Set<String> = []
    var hasCompletedOnboarding = true
    var isSavingOnboarding = false
    var onboardingErrorMessage: String?
    var isDeletingAccount = false
    var accountDeletionErrorMessage: String?

    private let client: APIClient
    private let googleAuthenticationSession = GoogleAuthenticationSession()
    private let mealDraftStore: MealDraftStore?
    private let mealCoordinator: MealSubmissionCoordinator?
    private var dayRequestGeneration = 0
    private var journalSaveGeneration = 0
    private var sleepRequestGeneration = 0
    private var sessionsRequestGeneration = 0
    private var effortRequestGeneration = 0
    private var authenticationGeneration = 0
    private var mealsRequestGeneration = 0
    private var mealOperationGeneration: [MealType: Int] = [:]
    @ObservationIgnored private var journalAutosaveTask: Task<Void, Never>?
    @ObservationIgnored private var journalSaveTail: Task<Void, Never>?
    @ObservationIgnored private var failedJournalSave: (mode: String, variableIDs: Set<String>?)?
    private var analysisRequestGeneration = 0

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
            if ProcessInfo.processInfo.arguments.contains("--preview-onboarding") {
                hasCompletedOnboarding = false
            }
            if ProcessInfo.processInfo.arguments.contains("--preview-settings") {
                destination = .settings
            } else if ProcessInfo.processInfo.arguments.contains("--health-preview") {
                destination = .health
            } else if ProcessInfo.processInfo.arguments.contains("--preview-meals") {
                destination = .day
            } else if ProcessInfo.processInfo.arguments.contains("--preview-export") {
                destination = .export
            } else if ProcessInfo.processInfo.arguments.contains("--preview-analysis") {
                destination = .analysis
            }
            isBootstrapping = false
        }
    }

    func login(email: String, password: String) async {
        invalidateSleep()
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
            currentUser = context.user
            isAuthenticated = true
            currentUser = context.user
            currentSession = context.session
            hasCompletedOnboarding = context.hasCompletedOnboarding
            guard context.hasCompletedOnboarding else { return }
            try await refreshDay()
            await restoreMealDrafts()
        }
    }

    func loginWithGoogle() async {
        guard !isLoading else { return }
        invalidateSleep()
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            #if os(macOS)
            let platform = "macos"
            let deviceName = Host.current().localizedName ?? "Mac"
            let callbackScheme = "com.soma.native.macos"
            #else
            let platform = "ios"
            let deviceName = UIDevice.current.name
            let callbackScheme = "com.soma.native.ios"
            #endif
            let attempt = try NativeOAuthAttempt()
            let authenticationURL = try await client.googleAuthenticationURL(platform: platform, attempt: attempt)
            let callbackURL = try await googleAuthenticationSession.authenticate(at: authenticationURL, callbackScheme: callbackScheme)
            let context = try await client.completeGoogleLogin(callbackURL: callbackURL, callbackScheme: callbackScheme, deviceName: deviceName, attempt: attempt)
            authenticationGeneration += 1
            isAuthenticated = true
            currentUser = context.user
            currentSession = context.session
            hasCompletedOnboarding = context.hasCompletedOnboarding
            guard context.hasCompletedOnboarding else { return }
            try await refreshDay()
            await restoreMealDrafts()
        } catch NativeOAuthError.cancelled {
            // Closing the system authentication sheet is an intentional, non-error outcome.
        } catch NativeOAuthError.invalidCallback, NativeOAuthError.invalidState {
            errorMessage = "La réponse Google n’est pas valide. Réessaie."
        } catch NativeOAuthError.providerUnavailable {
            errorMessage = "Google ne peut pas être ouvert sur cet appareil."
        } catch APIError.unauthorized {
            errorMessage = "La connexion Google a expiré. Réessaie."
        } catch let error as URLError where error.code == .timedOut {
            errorMessage = "La connexion prend trop de temps. Vérifie le réseau puis réessaie."
        } catch let error as URLError where error.code == .notConnectedToInternet {
            errorMessage = "Aucun réseau. Reconnecte-toi puis réessaie."
        } catch {
            errorMessage = "La connexion Google est momentanément indisponible."
        }
    }

    func restoreSession() async {
        guard !ProcessInfo.processInfo.arguments.contains("--preview-data") else { return }
        invalidateSleep()
        defer { isBootstrapping = false }
        do {
            guard try await client.hasAuthenticationToken() else {
                isAuthenticated = false
                return
            }
            let context = try await client.sessionContext()
            authenticationGeneration += 1
            currentUser = context.user
            currentSession = context.session
            isAuthenticated = true
            hasCompletedOnboarding = context.hasCompletedOnboarding
            guard context.hasCompletedOnboarding else { return }
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
            acceptDay(response)
        }
    }

    func refreshAnalysis(period: String? = nil) async {
        let requestedPeriod = period ?? analysisPeriod
        analysisPeriod = requestedPeriod
        if ProcessInfo.processInfo.arguments.contains("--preview-data") {
            loadedAnalysisPeriod = requestedPeriod
            return
        }
        analysisRequestGeneration += 1
        let requestGeneration = analysisRequestGeneration
        let generation = authenticationGeneration
        isAnalysisLoading = true
        analysisErrorMessage = nil
        defer {
            if requestGeneration == analysisRequestGeneration { isAnalysisLoading = false }
        }
        do {
            let response = try await client.matrix(period: requestedPeriod)
            guard response.period?.queryValue == requestedPeriod else { throw APIError.invalidResponse }
            guard requestGeneration == analysisRequestGeneration,
                  generation == authenticationGeneration,
                  analysisPeriod == requestedPeriod,
                  isAuthenticated else { return }
            matrix = response
            loadedAnalysisPeriod = requestedPeriod
        } catch is CancellationError {
            return
        } catch APIError.unauthorized {
            guard requestGeneration == analysisRequestGeneration else { return }
            expireLocalSession()
        } catch {
            guard requestGeneration == analysisRequestGeneration else { return }
            analysisErrorMessage = "L’analyse n’a pas pu être chargée."
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

    func completeOnboarding(_ request: OnboardingRequest) async -> Bool {
        guard !isSavingOnboarding else { return false }
        isSavingOnboarding = true
        onboardingErrorMessage = nil
        defer { isSavingOnboarding = false }
        do {
            try await client.completeOnboarding(request)
            if let context = try? await client.sessionContext() {
                currentUser = context.user
                currentSession = context.session
            }
            try await refreshDay()
            await restoreMealDrafts()
            hasCompletedOnboarding = true
            return true
        } catch APIError.unauthorized {
            expireLocalSession()
            return false
        } catch {
            onboardingErrorMessage = "Le profil n’a pas pu être enregistré. Vérifie ta connexion puis réessaie."
            return false
        }
    }

    func deleteAccount(confirmation: String) async -> Bool {
        guard !isDeletingAccount else { return false }
        let ownerUserID = currentUser?.id
        isDeletingAccount = true
        accountDeletionErrorMessage = nil
        defer { isDeletingAccount = false }
        do {
            try await client.deleteAccount(confirmation: confirmation)
            if let ownerUserID { try? await mealDraftStore?.removeAll(ownerUserID: ownerUserID) }
            clearAuthenticatedState()
            return true
        } catch APIError.unauthorized {
            expireLocalSession()
            return false
        } catch {
            accountDeletionErrorMessage = "Le compte n’a pas pu être supprimé. Aucune suppression partielle n’est confirmée. Réessaie plus tard."
            return false
        }
    }

    func refreshSleep() async {
        sleepRequestGeneration += 1
        let generation = sleepRequestGeneration
        isSleepLoading = true
        sleepErrorMessage = nil
        defer {
            if generation == sleepRequestGeneration { isSleepLoading = false }
        }
        do {
            let response = try await client.sleep()
            if generation == sleepRequestGeneration, isAuthenticated {
                sleep = response
            }
        } catch APIError.unauthorized {
            if generation == sleepRequestGeneration {
                expireLocalSession()
                sleepErrorMessage = "La session a expiré. Reconnecte-toi."
            }
        } catch {
            if generation == sleepRequestGeneration {
                sleepErrorMessage = "Les données de sommeil sont momentanément indisponibles."
            }
        }
    }

    func refreshEffort() async {
        effortRequestGeneration += 1
        let generation = effortRequestGeneration
        effortState = .loading
        do {
            let response = try await client.effort()
            guard generation == effortRequestGeneration, isAuthenticated else { return }
            effortState = .loaded(response)
        } catch APIError.unauthorized {
            guard generation == effortRequestGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == effortRequestGeneration, isAuthenticated else { return }
            effortState = .failed("Les données d’effort sont momentanément indisponibles.")
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
        journalSaveGeneration += 1
        activeDate = shifted
        day = nil
        journalDraft = nil
        journalAutosaveTask?.cancel()
        dayRequestGeneration += 1
        let generation = dayRequestGeneration
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await client.day(shifted)
            if generation == dayRequestGeneration, activeDate == shifted, response.date == shifted.rawValue {
                acceptDay(response)
                await restoreMealDrafts(for: shifted)
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
                ownerUserID: currentUser?.id,
                mealDate: draftDate,
                mealType: type,
                note: detail?.note ?? summary?.note,
                entryState: detail?.entryState ?? (summary?.entryState == "skipped" ? .skipped : .recorded),
                mouthWarmthIntensity: detail?.mouthWarmthIntensity,
                stomachOverfullIntensity: detail?.stomachOverfullIntensity
            )
            draft.remoteMealId = resolvedID
            draft.hasRemotePhotoEvidence = detail?.photos.contains { ($0.storageStatus ?? "available") == "available" }
            mealDrafts[type] = draft
            await persistMealDraft(type)
        }
    }

    func refreshMeals(days: Int = 28) async {
        guard !ProcessInfo.processInfo.arguments.contains("--preview-data") else { return }
        mealsRequestGeneration += 1
        let requestGeneration = mealsRequestGeneration
        let generation = authenticationGeneration
        let requestedDate = activeDate
        isLoadingMeals = true
        mealsErrorMessage = nil
        defer { if generation == authenticationGeneration { isLoadingMeals = false } }
        do {
            let start = try activeDate.adding(days: -(max(days, 1) - 1))
            let meals = try await client.meals(from: start, to: activeDate)
            guard generation == authenticationGeneration, requestGeneration == mealsRequestGeneration, activeDate == requestedDate, isAuthenticated else { return }
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
            _ = try await client.updateMealPhotoDetails(mealID: mealID, photoID: photoID, origin: origin)
            let meal = try await client.meal(id: mealID)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealDetails[mealID] = meal
            await invalidateDraftAfterRemotePhotoChange(meal)
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration else { return }
            mealsErrorMessage = "La provenance de la photo n’a pas pu être enregistrée."
        }
    }

    func updateRemotePhotoComment(_ comment: String, mealID: String, photoID: String) async {
        let generation = authenticationGeneration
        do {
            _ = try await client.updateMealPhotoDetails(mealID: mealID, photoID: photoID, comment: String(comment.prefix(240)))
            let meal = try await client.meal(id: mealID)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealDetails[mealID] = meal
            await invalidateDraftAfterRemotePhotoChange(meal)
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == authenticationGeneration else { return }
            mealsErrorMessage = "Le commentaire de la photo n’a pas pu être enregistré."
        }
    }

    func deleteRemotePhoto(mealID: String, photoID: String) async {
        let generation = authenticationGeneration
        do {
            try await client.deleteMealPhoto(mealID: mealID, photoID: photoID)
            let meal = try await client.meal(id: mealID)
            guard generation == authenticationGeneration, isAuthenticated else { return }
            mealDetails[mealID] = meal
            await invalidateDraftAfterRemotePhotoChange(meal)
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
                if let draft = mealDrafts[meal.mealType] { try? await mealDraftStore?.remove(draft.id, ownerUserID: currentUser?.id) }
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
        mealOperationGeneration[type, default: 0] += 1
        draft.note = String(note.prefix(500))
        draft.activeAnalysisRequestId = nil
        draft.analysisSourceRevision = nil
        draft.analysisSourceFingerprint = nil
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func setMealSkipped(_ skipped: Bool, for type: MealType) async {
        guard var draft = mealDrafts[type] else { return }
        mealOperationGeneration[type, default: 0] += 1
        draft.entryState = skipped ? .skipped : .recorded
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
        await submitMeal(type)
    }

    func addMealPhoto(sourceURL: URL, filename: String, mimeType: String, to type: MealType) async throws {
        guard var draft = mealDrafts[type], draft.photos.count < 6 else { return }
        mealOperationGeneration[type, default: 0] += 1
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
        mealOperationGeneration[type, default: 0] += 1
        draft.photos[index].origin = origin
        if let mealID = draft.remoteMealId, let remotePhotoID = draft.remotePhotoIDsByDraftID?[photoID] {
            do { _ = try await client.updateMealPhotoDetails(mealID: mealID, photoID: remotePhotoID, origin: origin) }
            catch { draft.lastError = "La provenance n’a pas pu être enregistrée."; mealDrafts[type] = draft; await persistMealDraft(type); return }
        }
        draft.activeAnalysisRequestId = nil
        draft.analysisSourceRevision = nil
        draft.analysisSourceFingerprint = nil
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func setPhotoComment(_ comment: String, photoID: UUID, for type: MealType) async {
        guard var draft = mealDrafts[type], let index = draft.photos.firstIndex(where: { $0.id == photoID }) else { return }
        mealOperationGeneration[type, default: 0] += 1
        draft.photos[index].comment = String(comment.prefix(240))
        if let mealID = draft.remoteMealId, let remotePhotoID = draft.remotePhotoIDsByDraftID?[photoID] {
            do { _ = try await client.updateMealPhotoDetails(mealID: mealID, photoID: remotePhotoID, comment: draft.photos[index].comment) }
            catch { draft.lastError = "Le commentaire n’a pas pu être enregistré."; mealDrafts[type] = draft; await persistMealDraft(type); return }
        }
        draft.activeAnalysisRequestId = nil
        draft.analysisSourceRevision = nil
        draft.analysisSourceFingerprint = nil
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func removeMealPhoto(_ photoID: UUID, from type: MealType) async {
        guard var draft = mealDrafts[type], let photo = draft.photos.first(where: { $0.id == photoID }) else { return }
        mealOperationGeneration[type, default: 0] += 1
        if let mealID = draft.remoteMealId, let remotePhotoID = draft.remotePhotoIDsByDraftID?[photoID] {
            do {
                try await client.deleteMealPhoto(mealID: mealID, photoID: remotePhotoID)
            } catch {
                draft.lastError = "La photo envoyée n’a pas pu être supprimée. Réessaie."
                mealDrafts[type] = draft
                await persistMealDraft(type)
                return
            }
        }
        try? FileManager.default.removeItem(at: photo.fileURL)
        draft.photos.removeAll { $0.id == photoID }
        draft.uploadedPhotoDraftIDs.remove(photoID)
        draft.remotePhotoIDsByDraftID?[photoID] = nil
        draft.activeAnalysisRequestId = nil
        draft.analysisSourceRevision = nil
        draft.analysisSourceFingerprint = nil
        draft.stage = .local
        mealDrafts[type] = draft
        await persistMealDraft(type)
    }

    func submitMeal(_ type: MealType) async {
        guard let coordinator = mealCoordinator, let draft = mealDrafts[type] else { return }
        let generation = authenticationGeneration
        let requestedDate = activeDate
        mealOperationGeneration[type, default: 0] += 1
        let operation = mealOperationGeneration[type, default: 0]
        func isCurrent() -> Bool { generation == authenticationGeneration && operation == mealOperationGeneration[type] && requestedDate == activeDate && isAuthenticated }
        do {
            var current = try await coordinator.submit(draft)
            guard isCurrent() else { return }
            mealDrafts[type] = current
            // The editor can start from an empty slot. As soon as the server
            // has assigned the durable meal id, load its detail so the result
            // is visible even though the sheet originally had a nil id.
            if let mealID = current.remoteMealId, let detail = try? await client.meal(id: mealID) {
                guard isCurrent() else { return }
                mealDetails[mealID] = detail
            }
            var remainingPolls = 30
            while current.stage == .polling, remainingPolls > 0 {
                try await Task.sleep(for: .seconds(2))
                current = try await coordinator.refresh(current)
                guard isCurrent() else { return }
                mealDrafts[type] = current
                if let mealID = current.remoteMealId, let detail = try? await client.meal(id: mealID) {
                    guard isCurrent() else { return }
                    mealDetails[mealID] = detail
                }
                remainingPolls -= 1
            }
            if current.stage == .polling {
                current.lastError = "L’analyse continue en arrière-plan. Rouvre ce repas pour reprendre le suivi."
                mealDrafts[type] = current
                try? await mealDraftStore?.save(current)
            }
            if current.stage == .awaitingConfirmation || current.stage == .confirmed {
                try? await refreshDay()
                if let mealID = current.remoteMealId, let detail = try? await client.meal(id: mealID) {
                    guard isCurrent() else { return }
                    mealDetails[mealID] = detail
                }
                await refreshMeals()
            }
        } catch APIError.unauthorized {
            guard generation == authenticationGeneration else { return }
            expireLocalSession()
        } catch {
            guard isCurrent() else { return }
            if let store = mealDraftStore, let restored = try? await store.load(draft.id, ownerUserID: currentUser?.id) {
                mealDrafts[type] = restored
            }
        }
    }

    func confirmMeal(_ type: MealType) async {
        guard let coordinator = mealCoordinator, let draft = mealDrafts[type] else { return }
        mealOperationGeneration[type, default: 0] += 1
        let generation = authenticationGeneration
        let operation = mealOperationGeneration[type, default: 0]
        do {
            let confirmed = try await coordinator.confirm(draft)
            guard generation == authenticationGeneration, operation == mealOperationGeneration[type], isAuthenticated else { return }
            mealDrafts[type] = confirmed
            try? await refreshDay()
            await refreshMeals()
        } catch APIError.unauthorized {
            expireLocalSession()
        } catch {
            mealsErrorMessage = "Le résultat n’a pas pu être confirmé. Réessaie."
        }
    }

    private func restoreMealDrafts(for requestedDate: LocalDate? = nil) async {
        guard let userID = currentUser?.id, let drafts = try? await mealDraftStore?.loadAll(ownerUserID: userID) else { return }
        guard requestedDate == nil || requestedDate == activeDate else { return }
        mealDrafts = drafts
            .filter { $0.ownerUserID == userID && $0.mealDate == (requestedDate ?? activeDate).rawValue }
            .reduce(into: [:]) { result, draft in
                var restored = draft
                if restored.stage == .completed { restored.stage = .awaitingConfirmation }
                result[restored.mealType] = restored
            }
        for draft in mealDrafts.values {
            guard let mealID = draft.remoteMealId, let detail = try? await client.meal(id: mealID) else { continue }
            guard requestedDate == nil || requestedDate == activeDate else { return }
            mealDetails[mealID] = detail
        }
        for (type, draft) in mealDrafts where draft.stage.isResumable {
            Task { await submitMeal(type) }
        }
    }

    private func persistMealDraft(_ type: MealType) async {
        guard var draft = mealDrafts[type], let userID = currentUser?.id else { return }
        if draft.ownerUserID != userID {
            draft.ownerUserID = userID
            mealDrafts[type] = draft
        }
        try? await mealDraftStore?.save(draft)
    }

    private func invalidateDraftAfterRemotePhotoChange(_ meal: Meal) async {
        guard var draft = mealDrafts[meal.mealType], draft.remoteMealId == meal.id else { return }
        mealOperationGeneration[meal.mealType, default: 0] += 1
        draft.hasRemotePhotoEvidence = meal.photos.contains { ($0.storageStatus ?? "available") == "available" }
        draft.activeAnalysisRequestId = nil
        draft.analysisSourceRevision = nil
        draft.analysisSourceFingerprint = nil
        draft.stage = .local
        draft.lastError = nil
        mealDrafts[meal.mealType] = draft
        await persistMealDraft(meal.mealType)
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

    func setJournalValue(_ value: JSONValue, for variableID: String) {
        guard var draft = journalDraft else { return }
        draft.set(value, for: variableID)
        journalDraft = draft
        journalSaveGeneration += 1
        journalSaveState = .idle
        failedJournalSave = nil
        scheduleJournalAutosave(variableID: variableID)
    }

    func validateJournal() async {
        journalAutosaveTask?.cancel()
        await enqueueJournalSave(mode: "validate", variableIDs: nil)
    }

    func retryJournalSave() {
        guard let failedJournalSave else { return }
        Task { await enqueueJournalSave(mode: failedJournalSave.mode, variableIDs: failedJournalSave.variableIDs) }
    }

    func createJournalVariable(_ request: JournalVariableCreateRequest) async -> Bool {
        let mutationID = "new"
        guard !journalMutationIDs.contains(mutationID) else { return false }
        journalMutationIDs.insert(mutationID)
        defer { journalMutationIDs.remove(mutationID) }
        journalMutationErrorMessage = nil
        do {
            _ = try await client.createJournalVariable(request)
            try await refreshDay()
            return true
        } catch APIError.unauthorized {
            expireLocalSession()
        } catch let APIError.server(_, message) {
            journalMutationErrorMessage = message ?? "Cette habitude n’a pas pu être créée."
        } catch {
            journalMutationErrorMessage = "Cette habitude n’a pas pu être créée."
        }
        return false
    }

    func updateJournalVariable(_ request: JournalVariableUpdateRequest) async -> Bool {
        await performJournalVariableUpdate(id: request.id) { try await self.client.updateJournalVariable(request) }
    }

    func updateJournalVariable(_ request: JournalVariableDefinitionUpdateRequest) async -> Bool {
        await performJournalVariableUpdate(id: request.id) { try await self.client.updateJournalVariable(request) }
    }

    private func performJournalVariableUpdate(id: String, operation: () async throws -> JournalVariableMutationResponse) async -> Bool {
        guard !journalMutationIDs.contains(id) else { return false }
        journalMutationIDs.insert(id)
        defer { journalMutationIDs.remove(id) }
        journalMutationErrorMessage = nil
        do {
            _ = try await operation()
            try await refreshDay()
            return true
        } catch APIError.unauthorized {
            expireLocalSession()
        } catch let APIError.server(_, message) {
            journalMutationErrorMessage = message ?? "Cette habitude n’a pas pu être modifiée."
        } catch {
            journalMutationErrorMessage = "Cette habitude n’a pas pu être modifiée."
        }
        return false
    }

    private func scheduleJournalAutosave(variableID: String) {
        scheduleJournalAutosave(variableIDs: [variableID], delay: .milliseconds(450))
    }

    private func scheduleJournalAutosave(variableIDs: Set<String>, delay: Duration) {
        journalAutosaveTask?.cancel()
        let requestedDate = activeDate
        journalAutosaveTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            guard !Task.isCancelled, let self, self.activeDate == requestedDate else { return }
            await self.enqueueJournalSave(mode: "draft", variableIDs: variableIDs)
        }
    }

    private func enqueueJournalSave(mode: String, variableIDs: Set<String>?) async {
        let preceding = journalSaveTail
        let task = Task { [weak self] in
            if let preceding { await preceding.value }
            guard !Task.isCancelled, let self else { return }
            await self.persistJournal(mode: mode, variableIDs: variableIDs)
        }
        journalSaveTail = task
        await task.value
    }

    private func persistJournal(mode: String, variableIDs: Set<String>?) async {
        guard let currentDay = day, let draft = journalDraft else { return }
        journalSaveGeneration += 1
        let generation = journalSaveGeneration
        let requestedDate = activeDate
        let entries = draft.entries(for: currentDay.variables, only: variableIDs)
        journalSaveState = .saving
        do {
            let response = try await client.saveJournal(JournalSaveRequest(entryDate: requestedDate.rawValue, mode: mode, entries: entries))
            guard generation == journalSaveGeneration, requestedDate == activeDate, response.date == requestedDate.rawValue else { return }
            journalDraft?.mergeServer(response, acknowledging: entries)
            day = response
            if journalDraft == nil { journalDraft = JournalDraft(day: response) }
            journalSaveState = .saved
            failedJournalSave = nil
        } catch APIError.unauthorized {
            guard generation == journalSaveGeneration else { return }
            expireLocalSession()
        } catch {
            guard generation == journalSaveGeneration, requestedDate == activeDate else { return }
            journalSaveState = .failed(mode == "validate" ? "Cette journée n’a pas pu être validée." : "Le brouillon n’a pas pu être enregistré.")
            failedJournalSave = (mode, variableIDs)
        }
    }

    func logout() async {
        let ownerUserID = currentUser?.id
        invalidateSleep()
        authenticationGeneration += 1
        dayRequestGeneration += 1
        journalSaveGeneration += 1
        journalAutosaveTask?.cancel()
        sessionsRequestGeneration += 1
        effortRequestGeneration += 1
        isLoading = true
        errorMessage = nil
        do { try await client.logout() }
        catch { errorMessage = "La session locale est fermée. La déconnexion distante n’a pas pu être confirmée." }
        if let ownerUserID { try? await mealDraftStore?.removeAll(ownerUserID: ownerUserID) }
        isAuthenticated = false
        currentUser = nil
        hasCompletedOnboarding = true
        day = nil
        journalDraft = nil
        journalSaveState = .idle
        matrix = nil
        loadedAnalysisPeriod = nil
        analysisRequestGeneration += 1
        isAnalysisLoading = false
        analysisErrorMessage = nil
        recovery = nil
        currentSession = nil
        deviceSessions = []
        mealDrafts = [:]
        mealHistory = []
        mealDetails = [:]
        effortState = .idle
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

    private func invalidateSleep() {
        sleepRequestGeneration += 1
        sleep = nil
        isSleepLoading = false
        sleepErrorMessage = nil
    }

    private func expireLocalSession() {
        let ownerUserID = currentUser?.id
        authenticationGeneration += 1
        dayRequestGeneration += 1
        journalSaveGeneration += 1
        journalAutosaveTask?.cancel()
        sessionsRequestGeneration += 1
        invalidateSleep()
        effortRequestGeneration += 1
        isAuthenticated = false
        currentUser = nil
        hasCompletedOnboarding = true
        currentSession = nil
        deviceSessions = []
        day = nil
        journalDraft = nil
        journalSaveState = .idle
        matrix = nil
        loadedAnalysisPeriod = nil
        analysisRequestGeneration += 1
        isAnalysisLoading = false
        analysisErrorMessage = nil
        recovery = nil
        mealDrafts = [:]
        mealHistory = []
        mealDetails = [:]
        isLoadingMeals = false
        effortState = .idle
        isLoadingSessions = false
        errorMessage = "La session a expiré. Reconnecte-toi."
        if let ownerUserID, let mealDraftStore {
            Task { try? await mealDraftStore.removeAll(ownerUserID: ownerUserID) }
        }
    }

    private func clearAuthenticatedState() {
        invalidateSleep()
        authenticationGeneration += 1
        dayRequestGeneration += 1
        journalSaveGeneration += 1
        sessionsRequestGeneration += 1
        effortRequestGeneration += 1
        isAuthenticated = false
        currentUser = nil
        currentSession = nil
        hasCompletedOnboarding = true
        deviceSessions = []
        day = nil
        matrix = nil
        recovery = nil
        mealDrafts = [:]
        mealHistory = []
        mealDetails = [:]
        effortState = .idle
    }

    private func loadSyntheticPreview() {
        authenticationGeneration += 1
        isAuthenticated = true
        currentUser = SessionUser(id: "preview-user", email: "jeremy@example.test", displayName: "Jérémy")
        if let preview = try? JSONDecoder().decode(NativeDayResponse.self, from: Data(Self.previewDay.utf8)) {
            acceptDay(preview)
        }
        matrix = try? JSONDecoder().decode(NativeMatrixResponse.self, from: Data(Self.previewMatrix.utf8))
        loadedAnalysisPeriod = "30"
        sleep = try? JSONDecoder().decode(NativeSleepResponse.self, from: Data(Self.previewSleep.utf8))
        mealHistory = (try? JSONDecoder().decode(MealListResponse.self, from: Data(Self.previewMeals.utf8)).meals) ?? []
        for meal in mealHistory { mealDetails[meal.id] = meal }
        effortState = (try? JSONDecoder().decode(EffortSnapshot.self, from: Data(Self.previewEffort.utf8))).map(EffortState.loaded) ?? .idle
        recovery = try? JSONDecoder().decode(NativeRecoveryResponse.self, from: Data(Self.previewRecovery.utf8))
        let now = Date()
        let previewCurrentSession = DeviceSession(id: "preview-current", platform: Self.previewPlatform, deviceName: Self.previewDeviceName, createdAt: now.addingTimeInterval(-86_400), expiresAt: now.addingTimeInterval(2_505_600))
        currentSession = previewCurrentSession
        deviceSessions = [
            previewCurrentSession,
            DeviceSession(id: "preview-other", platform: .web, deviceName: "Safari sur MacBook Air", createdAt: now.addingTimeInterval(-604_800), expiresAt: now.addingTimeInterval(1_987_200)),
        ]
    }

    private func acceptDay(_ response: NativeDayResponse) {
        if var draft = journalDraft, day?.date == response.date, draft.hasUnsavedChanges {
            draft.mergeServer(response)
            day = response
            journalDraft = draft
            return
        }
        day = response
        journalDraft = JournalDraft(day: response)
    }

    private static let previewDay = #"{"date":"2026-09-19","timezone":"Europe/Zurich","journal":{"variables":[{"id":"focus","name":"Concentration","variableType":"number","unit":"/10","options":[],"position":10,"isActive":true,"defaultValue":null,"dayPeriod":"day","captureMode":"manual","automaticMetricId":null,"trackingCadence":"daily"},{"id":"walk","name":"Marche","variableType":"number","unit":"min","options":[],"position":20,"isActive":true,"defaultValue":null,"dayPeriod":"day","captureMode":"manual","automaticMetricId":null,"trackingCadence":"daily"},{"id":"caffeine","name":"Caféine","variableType":"number","unit":"mg","options":[],"position":30,"isActive":true,"defaultValue":0,"dayPeriod":"day","captureMode":"manual","automaticMetricId":null,"trackingCadence":"daily"},{"id":"meditation","name":"Méditation","variableType":"boolean","unit":null,"options":[],"position":40,"isActive":true,"defaultValue":null,"dayPeriod":"day","captureMode":"manual","automaticMetricId":null,"trackingCadence":"daily"}],"entries":[{"variableId":"focus","entryDate":"2026-09-19","value":0},{"variableId":"meditation","entryDate":"2026-09-19","value":false}],"day":{"entryDate":"2026-09-19","status":"draft","validatedAt":null,"omittedVariableIds":["walk"]}},"meals":{"breakfast":null,"lunch":{"id":"meal-lunch","mealDate":"2026-09-19","mealType":"lunch","status":"draft","entryState":"skipped","note":null},"dinner":null,"snack":null}}"#
    private static let previewMatrix = #"{"period":30,"rows":[],"outcomes":[{"id":"hrv","label":"VFC","unit":"ms","direction":"higher"},{"id":"recovery","label":"Récupération","unit":"pts","direction":"higher"}],"periods":[15,30,90,"all"],"meaningfulRelations":[],"topRelations":[{"predictorId":"walk","outcomeId":"hrv","predictorLabel":"Marche","predictorUnit":"min","predictorKind":"numeric","predictorPresentation":"amount","outcomeLabel":"VFC","outcomeUnit":"ms","effect":4.2,"sampleSize":32,"effectConfidenceLow":1.1,"effectConfidenceHigh":7.3,"qValue":0.018,"percentEffect":8.1,"comparisonLabel":"+20 min","modelType":"plateau","modelImprovement":0.14,"nonlinearTested":true,"lagDays":1,"grain":"day","timeScale":"acute","period":30,"evidence":"established","stable":true,"stability":{"chronologicalBlocks":3,"directionHeldInBlocks":true,"trendAdjustedDirectionHeld":true,"outlierAdjustedDirectionHeld":true},"strength":"clear","coverageBySource":[{"source":"WHOOP","pairedDays":32,"pairedWeeks":0}],"minimumDaysRemaining":0,"practicallyMeaningful":true,"practicalThreshold":2,"practicalRatio":2.1,"featureEligible":true,"exclusionReasons":[],"excluded":false},{"predictorId":"late-meal","outcomeId":"recovery","predictorLabel":"Repas tardif","predictorUnit":"oui/non","predictorKind":"binary","predictorPresentation":"amount","outcomeLabel":"Récupération","outcomeUnit":"pts","effect":-6.4,"sampleSize":28,"effectConfidenceLow":-10.1,"effectConfidenceHigh":-2.7,"qValue":0.031,"comparisonLabel":"yes vs no","modelType":"binary","nonlinearTested":false,"lagDays":1,"grain":"day","timeScale":"acute","period":30,"evidence":"established","stable":true,"stability":{"chronologicalBlocks":2,"directionHeldInBlocks":true,"trendAdjustedDirectionHeld":true,"outlierAdjustedDirectionHeld":true},"coverageBySource":[{"source":"Journal + WHOOP","pairedDays":28,"pairedWeeks":0}],"practicallyMeaningful":true,"practicalThreshold":3,"practicalRatio":2.13,"featureEligible":true,"exclusionReasons":[],"excluded":false}],"acuteHighlights":[],"chronicHighlights":[],"coverageByMetric":[],"collectionProgress":[]}"#
    private static let previewSleep = #"{"timezone":"Europe/Zurich","importedAt":"2026-09-19T07:15:00Z","days":[{"metric_date":"2026-09-17","sleep_minutes":455,"sleep_need_minutes":510,"sleep_efficiency":91,"sleep_regularity":79,"sleep_latency_minutes":14,"sleep_awake_minutes":24,"sleep_awake_percent":5,"sleep_fragmentation":1.2,"sleep_deep_minutes":82,"sleep_deep_percent":18,"sleep_rem_minutes":105,"sleep_rem_percent":23,"sleep_light_minutes":268,"sleep_light_percent":59,"cumulative_sleep_debt_minutes":75,"bedtime":"2026-09-16T22:55:00Z","wake_time":"2026-09-17T06:54:00Z","source_freshness":{"latestMeasuredAt":"2026-09-17T06:54:00Z"}},{"metric_date":"2026-09-18","sleep_minutes":null,"sleep_need_minutes":510,"sleep_efficiency":null,"sleep_regularity":null,"sleep_latency_minutes":null,"sleep_awake_minutes":null,"sleep_awake_percent":null,"sleep_fragmentation":null,"sleep_deep_minutes":null,"sleep_deep_percent":null,"sleep_rem_minutes":null,"sleep_rem_percent":null,"sleep_light_minutes":null,"sleep_light_percent":null,"cumulative_sleep_debt_minutes":null,"bedtime":null,"wake_time":null,"source_freshness":null},{"metric_date":"2026-09-19","sleep_minutes":498,"sleep_need_minutes":510,"sleep_efficiency":94,"sleep_regularity":86,"sleep_latency_minutes":9,"sleep_awake_minutes":18,"sleep_awake_percent":3,"sleep_fragmentation":0.8,"sleep_deep_minutes":96,"sleep_deep_percent":19,"sleep_rem_minutes":119,"sleep_rem_percent":24,"sleep_light_minutes":283,"sleep_light_percent":57,"cumulative_sleep_debt_minutes":32,"bedtime":"2026-09-18T22:31:00Z","wake_time":"2026-09-19T07:07:00Z","source_freshness":{"latestMeasuredAt":"2026-09-19T07:07:00Z"}}],"scores":[{"score_date":"2026-09-19","kind":"sleep","score":91,"algorithm_version":"sleep-v0.2"}],"sleepRecommendation":{"bedtimeMinutes":1350,"wakeTimeMinutes":420,"sleepNeedMinutes":510},"latestSleepStages":[{"type":"DEEP","startTime":"2026-09-18T23:00:00Z","endTime":"2026-09-19T00:36:00Z"},{"type":"REM","startTime":"2026-09-19T04:00:00Z","endTime":"2026-09-19T05:59:00Z"}]}"#
    private static let previewMeals = #"{"meals":[{"id":"meal-dinner","mealDate":"2026-09-19","mealType":"dinner","note":"Riz, légumes et tofu","status":"confirmed","entryState":"recorded","mouthWarmthIntensity":0,"stomachOverfullIntensity":null,"createdAt":"2026-09-19T18:00:00Z","updatedAt":"2026-09-19T18:05:00Z","photos":[{"id":"photo-dinner","mealId":"meal-dinner","origin":"homemade","mimeType":"image/jpeg","bytes":120000,"filename":"diner.jpg","createdAt":"2026-09-19T18:00:00Z","storageStatus":"purged","purgedAt":"2026-09-19T18:05:00Z","url":null}],"analysis":{"id":"analysis-dinner","mealId":"meal-dinner","status":"completed","provider":"synthetic","model":"synthetic","result":{"summary":"Repas varié avec une source de protéines végétales.","dishType":"Plat complet","calorieAnalysis":null,"foods":[{"name":"Riz","preparation":"cuit","portion":"1 bol","confidence":"high"},{"name":"Tofu et légumes","preparation":null,"portion":"1 portion","confidence":"medium"}],"totals":{"calories":{"low":480,"likely":560,"high":650},"proteinGrams":{"low":20,"likely":25,"high":31},"carbohydrateGrams":{"low":65,"likely":74,"high":86},"fatGrams":{"low":14,"likely":18,"high":24},"fiberGrams":{"low":8,"likely":11,"high":15},"sugarGrams":null,"addedSugarGrams":null},"confidence":"medium","uncertainties":["Quantité d’huile non précisée"]},"error":null,"errorCode":null,"sourcePhotoIds":["photo-dinner"],"createdAt":"2026-09-19T18:00:00Z","completedAt":"2026-09-19T18:05:00Z"},"lastSuccessfulAnalysis":null},{"id":"meal-lunch","mealDate":"2026-09-19","mealType":"lunch","note":null,"status":"draft","entryState":"skipped","mouthWarmthIntensity":null,"stomachOverfullIntensity":null,"createdAt":"2026-09-19T12:00:00Z","updatedAt":"2026-09-19T12:00:00Z","photos":[],"analysis":null,"lastSuccessfulAnalysis":null},{"id":"meal-yesterday","mealDate":"2026-09-18","mealType":"breakfast","note":"Yaourt et fruits","status":"draft","entryState":"recorded","mouthWarmthIntensity":null,"stomachOverfullIntensity":null,"createdAt":"2026-09-18T07:00:00Z","updatedAt":"2026-09-18T07:00:00Z","photos":[],"analysis":{"id":"analysis-yesterday","mealId":"meal-yesterday","status":"running","provider":"synthetic","model":"synthetic","result":null,"error":null,"errorCode":null,"sourcePhotoIds":[],"createdAt":"2026-09-18T07:00:00Z","completedAt":null},"lastSuccessfulAnalysis":null}]}"#
    private static let previewEffort = #"{"timezone":"Europe/Zurich","period":{"days":30,"startDate":"2026-08-21","endDate":"2026-09-19"},"latestObservedDate":"2026-09-19","importedAt":"2026-09-19T18:05:00Z","measuredAt":"2026-09-19T18:00:00Z","latest":{"date":"2026-09-19","steps":8900,"exerciseMinutes":44,"activeEnergyKcal":540,"zoneMinutes":33,"weeklyLoad":408,"acuteChronicLoadRatio":1.04,"zones":{"light":12,"moderate":10,"vigorous":7,"peak":4},"provenance":"google_health"},"score":{"value":61,"date":"2026-09-19","coverage":1,"algorithmVersion":"effort-v3","provenance":"soma_calculation"},"coverage":{"expectedDays":30,"observedActivityDays":24,"byMetric":{"steps":0.8,"exercise_minutes":0.7,"active_energy_kcal":0.77,"zone_minutes":0.7}},"trends":[{"date":"2026-09-17","steps":7200,"exerciseMinutes":null,"activeEnergyKcal":420,"zoneMinutes":null},{"date":"2026-09-18","steps":0,"exerciseMinutes":0,"activeEnergyKcal":0,"zoneMinutes":0},{"date":"2026-09-19","steps":8900,"exerciseMinutes":44,"activeEnergyKcal":540,"zoneMinutes":33}],"exercises":[{"id":"synthetic-run","date":"2026-09-19","name":"Course extérieure","type":"RUNNING","durationMinutes":44,"activeMinutes":41,"calories":430,"distanceKm":7.2,"averageHeartRate":151,"zoneMinutes":36,"averageSpeedKph":9.8,"averagePaceSecondsPerKm":367,"elevationGainMeters":94,"steps":null,"runVo2Max":null,"swimLengths":null,"cadence":null,"strideLengthMeters":null,"groundContactMilliseconds":null,"verticalOscillationMillimeters":null,"verticalRatio":null,"provenance":"google_health"}]}"#
    private static let previewRecovery = #"{"timezone":"Europe/Zurich","periodDays":30,"latestDate":"2026-09-19","freshness":{"measuredAt":"2026-09-19T07:10:00.000Z","importedAt":"2026-09-19T08:02:00.000Z","state":"current","coverage":1},"score":{"value":74,"reason":null,"average":69.4,"measuredDays":26,"coverage":1,"algorithmVersion":"recovery-v1","components":{"hrv":{"value":78,"weight":0.4},"restingHeartRate":{"value":72,"weight":0.3},"sleep":{"value":70,"weight":0.3}}},"signals":{"hrv":{"current":57,"reference":51.8,"measuredDays":27,"unit":"ms"},"restingHeartRate":{"current":56,"reference":59.2,"measuredDays":29,"unit":"bpm"}},"trends":{"hrv":[{"date":"2026-09-12","value":48},{"date":"2026-09-13","value":51},{"date":"2026-09-14","value":null},{"date":"2026-09-15","value":53},{"date":"2026-09-16","value":50},{"date":"2026-09-17","value":55},{"date":"2026-09-18","value":54},{"date":"2026-09-19","value":57}],"restingHeartRate":[{"date":"2026-09-12","value":61},{"date":"2026-09-13","value":60},{"date":"2026-09-14","value":null},{"date":"2026-09-15","value":59},{"date":"2026-09-16","value":58},{"date":"2026-09-17","value":58},{"date":"2026-09-18","value":57},{"date":"2026-09-19","value":56}]},"provenance":{"measurements":{"kind":"health_source","label":"Sources santé importées"},"score":{"kind":"soma_calculation","label":"Calcul Soma"}}}"#

    #if os(macOS)
    private static let previewPlatform: SessionPlatform = .macos
    private static let previewDeviceName = "MacBook Air"
    #else
    private static let previewPlatform: SessionPlatform = .ios
    private static let previewDeviceName = "iPhone"
    #endif
}
