import Foundation
import Testing
@testable import SomaCore

private struct EmptyTokenStore: TokenStore {
    func read() throws -> String? { nil }
    func save(_ token: String) throws {}
    func clear() throws {}
}

@Test func localDateMovesWithoutChangingSource() throws {
    let today = try LocalDate("2026-09-19")
    #expect(try today.adding(days: -1).rawValue == "2026-09-18")
    #expect(today.rawValue == "2026-09-19")
}

@Test func journalKeepsMissingZeroAndFalseDistinct() throws {
    let values = try JSONDecoder().decode([JSONValue].self, from: Data("[null,0,false]".utf8))
    #expect(values == [.null, .number(0), .bool(false)])
}

@Test func mealSlotsKeepAbsentAndSkippedDistinct() throws {
    let json = #"{"breakfast":null,"lunch":{"id":"m1","mealDate":"2026-09-19","mealType":"lunch","status":"draft","entryState":"skipped","note":null},"dinner":null,"snack":null}"#
    let slots = try JSONDecoder().decode(MealSlots.self, from: Data(json.utf8))
    #expect(slots.breakfast == nil)
    #expect(slots.lunch?.entryState == "skipped")
}

@Test func nativeDayDecodesTheVersionedServerEnvelope() throws {
    let json = #"{"date":"2026-09-19","timezone":"Europe/Zurich","journal":{"variables":[],"entries":[],"day":null},"meals":{"breakfast":null,"lunch":null,"dinner":null,"snack":null}}"#
    let day = try JSONDecoder().decode(NativeDayResponse.self, from: Data(json.utf8))
    #expect(day.timezone == "Europe/Zurich")
    #expect(day.variables.isEmpty)
}

@Test func sessionEnvelopeIdentifiesCurrentDeviceAndDates() throws {
    let json = #"{"user":{"id":"user","email":null,"displayName":"Test User"},"session":{"id":"current-session","platform":"macos","deviceName":"Test Mac","createdAt":"2026-09-19T12:00:00.000Z","expiresAt":"2026-10-19T12:00:00.000Z"},"hasCompletedOnboarding":true}"#
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let response = try decoder.decode(SessionResponse.self, from: Data(json.utf8))
    #expect(response.session.id == "current-session")
    #expect(response.session.platform == .macos)
    #expect(response.user.email == nil)
    #expect(response.hasCompletedOnboarding)
}

@Test func onboardingRequestEncodesServerContract() throws {
    let request = OnboardingRequest(
        displayName: "Test",
        dateOfBirth: "1999-09-19",
        heightCm: 178,
        weightKg: 72,
        sexForHealthCalculations: .preferNotToSay,
        primaryGoal: .maintainHealth,
        baseSleepTargetMinutes: 510,
        usualWakeTime: "07:00",
        importRange: .allHistory,
        timezone: "Europe/Zurich"
    )
    let object = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
    #expect(object["sexForHealthCalculations"] as? String == "prefer_not_to_say")
    #expect(object["primaryGoal"] as? String == "maintain_health")
    #expect(object["importRange"] as? String == "all_history")
    #expect(object["selectedHabits"] as? [String] == [])
    #expect(object.keys.contains("secondaryGoal"))
    #expect(object["secondaryGoal"] is NSNull)
}

@Test func activeSessionsKeepDifferentPlatformsDistinct() throws {
    let json = #"{"sessions":[{"id":"ios-session","platform":"ios","deviceName":"iPhone","createdAt":"2026-09-18T12:00:00Z","expiresAt":"2026-10-18T12:00:00Z"},{"id":"web-session","platform":"web","deviceName":"Navigateur","createdAt":"2026-09-17T12:00:00Z","expiresAt":"2026-10-17T12:00:00Z"}]}"#
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let response = try decoder.decode(DeviceSessionsResponse.self, from: Data(json.utf8))
    #expect(response.sessions.map(\.platform) == [.ios, .web])
}

@Test func nativeOAuthUsesPKCEAndRejectsUnexpectedCallbacks() throws {
    let attempt = NativeOAuthAttempt(state: String(repeating: "s", count: 43), codeVerifier: String(repeating: "v", count: 48))
    #expect(attempt.codeChallenge.count == 43)
    let code = String(repeating: "c", count: 64)
    let callback = URL(string: "com.soma.native.ios://auth/callback?code=\(code)&state=\(attempt.state)")!
    #expect(try NativeOAuthCallback.parse(callback, expectedScheme: "com.soma.native.ios", expectedState: attempt.state).code == code)
    #expect(throws: NativeOAuthError.invalidState) {
        try NativeOAuthCallback.parse(callback, expectedScheme: "com.soma.native.ios", expectedState: "wrong-state")
    }
    #expect(throws: NativeOAuthError.invalidCallback) {
        try NativeOAuthCallback.parse(callback, expectedScheme: "com.soma.native.macos", expectedState: attempt.state)
    }
}

@Test func nativeOAuthCancellationIsDistinctFromInvalidCallback() throws {
    let state = String(repeating: "s", count: 43)
    let callback = URL(string: "com.soma.native.macos://auth/callback?error=cancelled&state=\(state)")!
    #expect(throws: NativeOAuthError.cancelled) {
        try NativeOAuthCallback.parse(callback, expectedScheme: "com.soma.native.macos", expectedState: state)
    }
}

@Test func nativeOAuthStartURLDoesNotExposeDeviceName() async throws {
    let client = APIClient(baseURL: URL(string: "https://soma.example")!, tokenStore: EmptyTokenStore())
    let attempt = NativeOAuthAttempt(state: String(repeating: "s", count: 43), codeVerifier: String(repeating: "v", count: 48))
    let url = try await client.googleAuthenticationURL(platform: "ios", attempt: attempt)
    let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    #expect(query.first(where: { $0.name == "device_name" }) == nil)
    #expect(query.first(where: { $0.name == "code_challenge" })?.value == attempt.codeChallenge)
}

@Test func strongestEffectsRelationsKeepPeriodsAndLagsDistinct() throws {
    let json = #"{"rows":[{"id":"30:walk:lag-0","label":"Marche","relations":[{"predictorId":"walk","outcomeId":"sleep","sampleSize":20,"effect":0.2,"effectConfidenceLow":0.1,"effectConfidenceHigh":0.3,"lagDays":0,"period":30},{"predictorId":"walk","outcomeId":"sleep","sampleSize":18,"effect":0.3,"effectConfidenceLow":0.1,"effectConfidenceHigh":0.5,"lagDays":1,"period":30}]}],"outcomes":[],"periods":[30]}"#
    let matrix = try JSONDecoder().decode(NativeMatrixResponse.self, from: Data(json.utf8))
    #expect(Set(matrix.relations.map(\.id)).count == 2)
}

@Test func strongestEffectsDecodesTheCanonicalServerEvidence() throws {
    let json = #"{"rows":[],"outcomes":[{"id":"hrv","label":"VFC","unit":"ms","direction":"higher"}],"periods":[15,30,90,"all"],"meaningfulRelations":[],"topRelations":[{"predictorId":"walk","outcomeId":"hrv","predictorLabel":"Marche","predictorUnit":"min","predictorKind":"numeric","predictorPresentation":"amount","outcomeLabel":"VFC","outcomeUnit":"ms","effect":4.2,"sampleSize":32,"effectConfidenceLow":1.1,"effectConfidenceHigh":7.3,"effectiveSampleSize":32,"pValue":0.004,"qValue":0.018,"percentEffect":8.1,"comparisonLabel":"+20 min","modelType":"plateau","modelImprovement":0.14,"nonlinearTested":true,"lagDays":1,"grain":"day","timeScale":"acute","period":30,"evidence":"established","stable":true,"stability":{"chronologicalBlocks":3,"directionHeldInBlocks":true,"trendAdjustedDirectionHeld":true,"outlierAdjustedDirectionHeld":true},"strength":"clear","coverageBySource":[{"source":"WHOOP","pairedDays":32,"pairedWeeks":0}],"minimumDaysRemaining":0,"practicallyMeaningful":true,"practicalThreshold":2,"practicalRatio":2.1,"featureEligible":true,"exclusionReasons":[],"excluded":false}],"acuteHighlights":[],"chronicHighlights":[],"coverageByMetric":[{"id":"walk","label":"Marche","recordedDays":32,"requiredDays":15,"sources":[{"source":"Journal","days":32}]}],"collectionProgress":[]}"#
    let matrix = try JSONDecoder().decode(NativeMatrixResponse.self, from: Data(json.utf8))
    let relation = try #require(matrix.strongestRelations.first)
    #expect(matrix.periods == [.days(15), .days(30), .days(90), .all])
    #expect(relation.effect == 4.2)
    #expect(relation.qValue == 0.018)
    #expect(relation.stability?.chronologicalBlocks == 3)
    #expect(relation.modelType == "plateau")
    #expect(relation.coverageBySource?.first?.pairedDays == 32)
    #expect(matrix.outcomes.first?.direction == "higher")
}

@Test func journalSavePreservesExplicitZeroFalseAndMissing() throws {
    let request = JournalSaveRequest(entryDate: "2026-09-19", entries: [
        JournalSaveEntry(variableId: "zero", value: .number(0)),
        JournalSaveEntry(variableId: "false", value: .bool(false)),
        JournalSaveEntry(variableId: "missing", value: .null),
    ])
    let decoded = try JSONDecoder().decode(JournalSaveRequest.self, from: JSONEncoder().encode(request))
    #expect(decoded.entries.map(\.value) == [.number(0), .bool(false), .null])
}

@Test func mealDraftKeepsStableOperationKeysAcrossPersistence() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try MealDraftStore(directory: directory)
    let draft = MealDraft(mealDate: "2026-09-19", mealType: .dinner)
    try await store.save(draft)
    let loaded = try await store.load(draft.id)
    #expect(loaded?.createIdempotencyKey == draft.createIdempotencyKey)
    #expect(loaded?.uploadIdempotencyKey == draft.uploadIdempotencyKey)
    #expect(loaded?.analysisIdempotencyKey == draft.analysisIdempotencyKey)
}

@Test func skippedDraftRemainsDistinctFromAbsentFeelings() throws {
    let draft = MealDraft(mealDate: "2026-09-19", mealType: .lunch, entryState: .skipped)
    let decoded = try JSONDecoder().decode(MealDraft.self, from: JSONEncoder().encode(draft))
    #expect(decoded.entryState == .skipped)
    #expect(decoded.mouthWarmthIntensity == nil)
    #expect(decoded.stomachOverfullIntensity == nil)
}

@Test func confirmedMealDecodesNutritionWithoutInventingMissingValues() throws {
    let json = #"{"meals":[{"id":"meal-synthetic","mealDate":"2026-09-19","mealType":"dinner","note":"Repas synthétique","status":"confirmed","entryState":"recorded","mouthWarmthIntensity":0,"stomachOverfullIntensity":null,"createdAt":"2026-09-19T18:00:00Z","updatedAt":"2026-09-19T18:05:00Z","photos":[],"analysis":{"id":"analysis-synthetic","mealId":"meal-synthetic","status":"completed","provider":"synthetic","model":"synthetic","result":{"summary":"Résultat synthétique","dishType":null,"calorieAnalysis":null,"foods":[],"totals":{"calories":{"low":400,"likely":500,"high":600},"proteinGrams":null,"carbohydrateGrams":null,"fatGrams":null,"fiberGrams":null},"confidence":"medium","uncertainties":[]},"error":null,"errorCode":null,"sourcePhotoIds":[],"createdAt":"2026-09-19T18:00:00Z","completedAt":"2026-09-19T18:05:00Z"},"lastSuccessfulAnalysis":null}]}"#
    let response = try JSONDecoder().decode(MealListResponse.self, from: Data(json.utf8))
    let meal = try #require(response.meals.first)
    #expect(meal.mouthWarmthIntensity == 0)
    #expect(meal.stomachOverfullIntensity == nil)
    #expect(meal.analysis?.result?.totals.calories?.likely == 500)
    #expect(meal.analysis?.result?.totals.proteinGrams == nil)
}

@Test func exportManifestDecodesSyntheticReferencesWithoutLoadingAccountData() throws {
    let json = #"{"exportedAt":"2026-09-19T09:30:00.000Z","account":{"id":"synthetic"},"data":{"journal_entries":[]},"archiveDownloads":[{"path":"synthetic/archive.json","signedUrl":"/api/native/v1/account/archive?key=synthetic%2Farchive.json"}],"mealPhotoDownloads":[{"mealId":"meal-synthetic","photoId":"photo-synthetic","path":"/api/native/v1/meals/meal-synthetic/photos/photo-synthetic"}]}"#
    let manifest = try JSONDecoder().decode(ExportManifest.self, from: Data(json.utf8))
    #expect(manifest.exportedAt == "2026-09-19T09:30:00.000Z")
    #expect(manifest.archiveDownloads.map(\.path) == ["synthetic/archive.json"])
    #expect(manifest.mealPhotoDownloads.map(\.photoId) == ["photo-synthetic"])
}

@Test func exportProgressDistinguishesKnownAndUnknownTotals() {
    #expect(ExportDownloadProgress(completedBytes: 25, totalBytes: 100).fractionCompleted == 0.25)
    #expect(ExportDownloadProgress(completedBytes: 25, totalBytes: nil).fractionCompleted == nil)
}

@Test func exportFilenameSanitizationPreventsPathTraversal() {
    #expect(AccountExportClient.safeFilename("../../private/export\n.json") == "..-..-private-export-.json")
    #expect(AccountExportClient.safeFilename("   ") == "soma-export")
}

@Test func archiveDownloadAlwaysUsesTheNativeHostAndEncodedKey() throws {
    let url = try AccountExportClient.archiveURL(
        baseURL: URL(string: "https://soma.example")!,
        objectPath: "synthetic folder/archive+one.json"
    )
    #expect(url.host == "soma.example")
    #expect(url.path == "/api/native/v1/account/archive")
    #expect(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value == "synthetic folder/archive+one.json")
}
