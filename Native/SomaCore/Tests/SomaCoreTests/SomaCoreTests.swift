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

@Test func sessionEnvelopeIdentifiesCurrentDeviceAndDates() throws {
    let json = #"{"user":{"id":"user","email":null,"displayName":"Test User"},"session":{"id":"current-session","platform":"macos","deviceName":"Test Mac","createdAt":"2026-09-19T12:00:00.000Z","expiresAt":"2026-10-19T12:00:00.000Z"}}"#
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let response = try decoder.decode(SessionResponse.self, from: Data(json.utf8))
    #expect(response.session.id == "current-session")
    #expect(response.session.platform == .macos)
    #expect(response.user.email == nil)
}

@Test func activeSessionsKeepDifferentPlatformsDistinct() throws {
    let json = #"{"sessions":[{"id":"ios-session","platform":"ios","deviceName":"iPhone","createdAt":"2026-09-18T12:00:00Z","expiresAt":"2026-10-18T12:00:00Z"},{"id":"web-session","platform":"web","deviceName":"Navigateur","createdAt":"2026-09-17T12:00:00Z","expiresAt":"2026-10-17T12:00:00Z"}]}"#
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let response = try decoder.decode(DeviceSessionsResponse.self, from: Data(json.utf8))
    #expect(response.sessions.map(\.platform) == [.ios, .web])
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
