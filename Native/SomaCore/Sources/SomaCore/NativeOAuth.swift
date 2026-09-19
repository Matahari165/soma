import CryptoKit
import Foundation
import Security

public struct NativeOAuthAttempt: Equatable, Sendable {
    public let state: String
    public let codeVerifier: String
    public let codeChallenge: String

    public init() throws {
        state = try Self.randomURLSafeString(byteCount: 32)
        codeVerifier = try Self.randomURLSafeString(byteCount: 48)
        codeChallenge = Self.challenge(for: codeVerifier)
    }

    public init(state: String, codeVerifier: String) {
        self.state = state
        self.codeVerifier = codeVerifier
        codeChallenge = Self.challenge(for: codeVerifier)
    }

    public static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
    }

    private static func randomURLSafeString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { throw NativeOAuthError.randomGenerationFailed }
        return Data(bytes).base64URLEncodedString()
    }
}

public struct NativeOAuthCallback: Equatable, Sendable {
    public let code: String

    public static func parse(_ url: URL, expectedScheme: String, expectedState: String) throws -> Self {
        guard url.scheme == expectedScheme, url.host == "auth", url.path == "/callback" else {
            throw NativeOAuthError.invalidCallback
        }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in query.first(where: { $0.name == name })?.value }
        guard value("state") == expectedState else { throw NativeOAuthError.invalidState }
        if value("error") == "cancelled" { throw NativeOAuthError.cancelled }
        guard let code = value("code"), code.range(of: #"^[A-Za-z0-9_-]{43,128}$"#, options: .regularExpression) != nil else {
            throw NativeOAuthError.invalidCallback
        }
        return Self(code: code)
    }
}

public enum NativeOAuthError: Error, Equatable, Sendable {
    case cancelled
    case invalidCallback
    case invalidState
    case randomGenerationFailed
    case providerUnavailable
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
