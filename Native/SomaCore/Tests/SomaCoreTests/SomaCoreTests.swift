import Foundation
import Testing
@testable import SomaCore

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

@Test func strongestEffectsRelationsKeepPeriodsAndLagsDistinct() throws {
    let json = #"{"rows":[{"id":"30:walk:lag-0","label":"Marche","relations":[{"predictorId":"walk","outcomeId":"sleep","sampleSize":20,"effect":0.2,"effectConfidenceLow":0.1,"effectConfidenceHigh":0.3,"lagDays":0,"period":30},{"predictorId":"walk","outcomeId":"sleep","sampleSize":18,"effect":0.3,"effectConfidenceLow":0.1,"effectConfidenceHigh":0.5,"lagDays":1,"period":30}]}],"outcomes":[],"periods":[30]}"#
    let matrix = try JSONDecoder().decode(NativeMatrixResponse.self, from: Data(json.utf8))
    #expect(Set(matrix.relations.map(\.id)).count == 2)
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
