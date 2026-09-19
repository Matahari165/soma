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

    public func login(email: String, password: String, platform: String, deviceName: String) async throws -> SessionUser {
        let request = try request(path: "/api/native/v1/auth/login", method: "POST", body: LoginRequest(email: email, password: password, platform: platform, deviceName: deviceName), authenticated: false)
        let response: LoginResponse = try await perform(request)
        try tokenStore.save(response.token)
        return response.user
    }

    public func day(_ date: LocalDate) async throws -> NativeDayResponse {
        try await get(path: "/api/native/v1/lab/day?date=\(date.rawValue)")
    }

    public func currentSession() async throws -> SessionUser {
        let response: SessionResponse = try await get(path: "/api/native/v1/auth/session")
        return response.user
    }

    public func matrix(period: String) async throws -> NativeMatrixResponse {
        try await get(path: "/api/native/v1/lab/matrix?period=\(period)")
    }

    public func saveJournal(_ body: JournalSaveRequest) async throws -> NativeDayResponse {
        let request = try request(path: "/api/native/v1/lab/journal", method: "PUT", body: body, authenticated: true)
        let response: JournalSaveResponse = try await perform(request)
        return response.day
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
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 {
            let sentToken = request.value(forHTTPHeaderField: "Authorization")?.dropFirst("Bearer ".count)
            if let sentToken, let currentToken = try? tokenStore.read(), currentToken == String(sentToken) {
                try? tokenStore.clear()
            }
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

private struct LoginRequest: Encodable { let email: String; let password: String; let platform: String; let deviceName: String }
private struct EmptyResponse: Decodable { let ok: Bool }

public enum APIError: Error, Equatable, Sendable {
    case invalidURL
    case invalidResponse
    case unauthorized
    case http(Int)
}
