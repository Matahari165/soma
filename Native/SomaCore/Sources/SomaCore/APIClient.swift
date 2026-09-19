import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: any TokenStore

    public init(baseURL: URL, session: URLSession = .shared, tokenStore: any TokenStore) {
        self.baseURL = baseURL
        self.session = session
        self.tokenStore = tokenStore
    }

    public func login(email: String, password: String, platform: String, deviceName: String) async throws -> SessionResponse {
        let request = try request(path: "/api/native/v1/auth/login", method: "POST", body: LoginRequest(email: email, password: password, platform: platform, deviceName: deviceName), authenticated: false)
        let response: LoginResponse = try await perform(request)
        try tokenStore.save(response.token)
        return SessionResponse(
            user: response.user,
            session: response.session,
            hasCompletedOnboarding: response.hasCompletedOnboarding
        )
    }

    public func day(_ date: LocalDate) async throws -> NativeDayResponse {
        try await get(path: "/api/native/v1/lab/day?date=\(date.rawValue)")
    }

    public func currentSession() async throws -> SessionUser {
        let response: SessionResponse = try await get(path: "/api/native/v1/auth/session")
        return response.user
    }

    public func hasAuthenticationToken() throws -> Bool {
        try tokenStore.read() != nil
    }

    public func sessionContext() async throws -> SessionResponse {
        try await get(path: "/api/native/v1/auth/session")
    }

    public func deviceSessions() async throws -> [DeviceSession] {
        let response: DeviceSessionsResponse = try await get(path: "/api/native/v1/auth/sessions")
        return response.sessions
    }

    public func revokeDeviceSession(id: String) async throws {
        let request = try request(path: "/api/native/v1/auth/sessions/\(pathComponent(id))", method: "DELETE", body: Optional<String>.none, authenticated: true)
        let _: EmptyResponse = try await perform(request)
    }

    public func completeOnboarding(_ body: OnboardingRequest) async throws {
        let response: EmptyResponse = try await perform(request(path: "/api/native/v1/onboarding", method: "POST", body: body, authenticated: true))
        guard response.ok else { throw APIError.invalidResponse }
    }

    public func deleteAccount(confirmation: String) async throws {
        let response: EmptyResponse = try await perform(request(
            path: "/api/native/v1/account",
            method: "DELETE",
            body: AccountDeletionRequest(confirmation: confirmation),
            authenticated: true
        ))
        guard response.ok else { throw APIError.invalidResponse }
        try tokenStore.clear()
    }

    public func matrix(period: String) async throws -> NativeMatrixResponse {
        try await get(path: "/api/native/v1/lab/matrix?period=\(period)")
    }

    public func sleep() async throws -> NativeSleepResponse {
        try await get(path: "/api/native/v1/sleep")
    }

    public func effort() async throws -> EffortSnapshot {
        try await get(path: "/api/native/v1/effort")
    }

    public func recovery() async throws -> NativeRecoveryResponse {
        try await get(path: "/api/native/v1/recovery")
    }

    public func saveJournal(_ body: JournalSaveRequest) async throws -> NativeDayResponse {
        let request = try request(path: "/api/native/v1/lab/journal", method: "PUT", body: body, authenticated: true)
        let response: JournalSaveResponse = try await perform(request)
        return response.day
    }

    public func createMeal(from draft: MealDraft) async throws -> MealMutationResponse {
        let body = MealCreateRequest(mealDate: draft.mealDate, mealType: draft.mealType, note: draft.note, entryState: draft.entryState, mouthWarmthIntensity: draft.mouthWarmthIntensity, stomachOverfullIntensity: draft.stomachOverfullIntensity, idempotencyKey: draft.createIdempotencyKey)
        var request = try request(path: "/api/native/v1/meals", method: "POST", body: body, authenticated: true)
        request.setValue(draft.createIdempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        return try await perform(request)
    }

    public func meals(from: LocalDate, to: LocalDate) async throws -> [Meal] {
        let response: MealListResponse = try await get(path: "/api/native/v1/meals?from=\(from.rawValue)&to=\(to.rawValue)")
        return response.meals
    }

    public func meal(id: String) async throws -> Meal {
        let response: MealResponse = try await get(path: "/api/native/v1/meals/\(pathComponent(id))")
        return response.meal
    }

    public func updateMeal(id: String, body: MealUpdateRequest) async throws -> MealMutationResponse {
        try await perform(request(path: "/api/native/v1/meals/\(pathComponent(id))", method: "PATCH", body: body, authenticated: true))
    }

    public func deleteMeal(id: String) async throws {
        let response: EmptyResponse = try await perform(request(path: "/api/native/v1/meals/\(pathComponent(id))", method: "DELETE", body: Optional<String>.none, authenticated: true))
        guard response.ok else { throw APIError.invalidResponse }
    }

    public func updateMealPhotoOrigin(mealID: String, photoID: String, origin: MealPhotoOrigin) async throws -> MealPhoto {
        let response: MealPhotoResponse = try await perform(request(
            path: "/api/native/v1/meals/\(pathComponent(mealID))/photos/\(pathComponent(photoID))",
            method: "PATCH",
            body: MealPhotoOriginRequest(origin: origin),
            authenticated: true
        ))
        return response.photo
    }

    public func deleteMealPhoto(mealID: String, photoID: String) async throws {
        let response: EmptyResponse = try await perform(request(
            path: "/api/native/v1/meals/\(pathComponent(mealID))/photos/\(pathComponent(photoID))",
            method: "DELETE",
            body: Optional<String>.none,
            authenticated: true
        ))
        guard response.ok else { throw APIError.invalidResponse }
    }

    public func uploadMealPhotos(mealID: String, photos: [MealDraftPhoto], idempotencyKey: String) async throws -> MealPhotosResponse {
        let boundary = "SomaBoundary-\(UUID().uuidString)"
        let multipartFile = FileManager.default.temporaryDirectory.appending(path: "soma-upload-\(UUID().uuidString).multipart")
        FileManager.default.createFile(atPath: multipartFile.path, contents: nil)
        defer { try? FileManager.default.removeItem(at: multipartFile) }
        let output = try FileHandle(forWritingTo: multipartFile)
        defer { try? output.close() }
        for (index, photo) in photos.enumerated() {
            try output.write(contentsOf: Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"origin_\(index)\"\r\n\r\n\(photo.origin.rawValue)\r\n".utf8))
            try output.write(contentsOf: Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"photos\"; filename=\"\(safeFilename(photo.filename))\"\r\nContent-Type: \(photo.mimeType)\r\n\r\n".utf8))
            try streamFile(photo.fileURL, to: output)
            try output.write(contentsOf: Data("\r\n".utf8))
        }
        try output.write(contentsOf: Data("--\(boundary)--\r\n".utf8))
        try output.synchronize()
        try output.close()
        var request = try request(path: "/api/native/v1/meals/\(pathComponent(mealID))/photos", body: Optional<String>.none, authenticated: true)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        return try await performUpload(request, fromFile: multipartFile)
    }

    public func requestMealAnalysis(mealID: String, idempotencyKey: String, force: Bool = false) async throws -> MealAnalysisResponse {
        var request = try request(path: "/api/native/v1/meals/\(pathComponent(mealID))/analysis", method: "POST", body: MealAnalysisRequest(force: force, idempotencyKey: idempotencyKey), authenticated: true)
        request.setValue(idempotencyKey, forHTTPHeaderField: "X-Analysis-Request-Id")
        return try await perform(request)
    }

    public func mealAnalysisStatus(mealID: String, requestID: String? = nil) async throws -> MealAnalysisResponse {
        var request = try request(path: "/api/native/v1/meals/\(pathComponent(mealID))/analysis", body: Optional<String>.none, authenticated: true)
        if let requestID { request.setValue(requestID, forHTTPHeaderField: "X-Analysis-Request-Id") }
        return try await perform(request)
    }

    public func logout() async throws {
        let request = try request(path: "/api/native/v1/auth/session", method: "DELETE", body: Optional<String>.none, authenticated: true)
        var remoteError: Error?
        do { let _: EmptyResponse = try await perform(request) }
        catch APIError.unauthorized { }
        catch { remoteError = error }
        try tokenStore.clear()
        if let remoteError { throw remoteError }
    }

    private func get<Response: Decodable>(path: String) async throws -> Response {
        try await perform(request(path: path, body: Optional<String>.none, authenticated: true))
    }

    private func request<Body: Encodable>(path: String, method: String = "GET", body: Body? = nil, authenticated: Bool) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated {
            guard let token = try tokenStore.read() else { throw APIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        return try decode(data: data, response: response, request: request)
    }

    private func performUpload<Response: Decodable>(_ request: URLRequest, fromFile fileURL: URL) async throws -> Response {
        let (data, response) = try await session.upload(for: request, fromFile: fileURL)
        return try decode(data: data, response: response, request: request)
    }

    private func decode<Response: Decodable>(data: Data, response: URLResponse, request: URLRequest) throws -> Response {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 {
            let sentToken = request.value(forHTTPHeaderField: "Authorization")?.dropFirst("Bearer ".count)
            if let sentToken, let currentToken = try? tokenStore.read(), currentToken == String(sentToken) {
                try? tokenStore.clear()
            }
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        return try Self.decoder.decode(Response.self, from: data)
    }

    private func pathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }

    private func safeFilename(_ value: String) -> String {
        value.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
    }

    private func streamFile(_ fileURL: URL, to output: FileHandle) throws {
        let input = try FileHandle(forReadingFrom: fileURL)
        defer { try? input.close() }
        while let chunk = try input.read(upToCount: 1_048_576), !chunk.isEmpty { try output.write(contentsOf: chunk) }
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

public struct MealUpdateRequest: Codable, Equatable, Sendable {
    public var mealDate: String?; public var mealType: MealType?; public var note: String?; public var status: MealStatus?; public var entryState: MealEntryState?; public var mouthWarmthIntensity: Int?; public var stomachOverfullIntensity: Int?
    public init(mealDate: String? = nil, mealType: MealType? = nil, note: String? = nil, status: MealStatus? = nil, entryState: MealEntryState? = nil, mouthWarmthIntensity: Int? = nil, stomachOverfullIntensity: Int? = nil) {
        self.mealDate = mealDate; self.mealType = mealType; self.note = note; self.status = status; self.entryState = entryState; self.mouthWarmthIntensity = mouthWarmthIntensity; self.stomachOverfullIntensity = stomachOverfullIntensity
    }
}

public struct MealMutationResponse: Codable, Sendable { public let meal: Meal; public let created: Bool? }
public struct MealPhotosResponse: Codable, Sendable { public let photos: [MealPhoto] }
public struct MealPhotoResponse: Codable, Sendable { public let photo: MealPhoto }
public struct MealAnalysisResponse: Codable, Sendable {
    public let analysis: MealAnalysisRecord?; public let meal: Meal?; public let fresh: Bool?; public let queued: Bool?; public let requestId: String?
}

private struct MealCreateRequest: Codable, Sendable {
    let mealDate: String; let mealType: MealType; let note: String?; let entryState: MealEntryState; let mouthWarmthIntensity: Int?; let stomachOverfullIntensity: Int?; let idempotencyKey: String
}
private struct MealAnalysisRequest: Codable, Sendable { let force: Bool; let idempotencyKey: String }
private struct MealPhotoOriginRequest: Codable, Sendable { let origin: MealPhotoOrigin }

private struct LoginRequest: Encodable { let email: String; let password: String; let platform: String; let deviceName: String }
private struct AccountDeletionRequest: Encodable { let confirmation: String }

public enum APIError: Error, Equatable, Sendable {
    case invalidURL
    case invalidResponse
    case unauthorized
    case http(Int)
}
