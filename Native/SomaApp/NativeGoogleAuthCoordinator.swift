import Foundation
import CryptoKit
import GoogleSignIn
import Security
import SomaCore
import Supabase
#if os(macOS)
import AuthenticationServices
#endif
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
final class NativeGoogleAuthCoordinator {
    private var supabase: SupabaseClient?
    #if os(macOS)
    private var activeAttempt: MacOAuthAttempt?
    #endif

    func signIn() async throws -> String {
        let configuration = try NativeGoogleAuthConfiguration.load()
        #if os(macOS)
        let client = makeSupabaseClient(configuration: configuration)
        supabase = client
        let session: Session
        do {
            session = try await client.auth.signInWithOAuth(
                provider: .google,
                redirectTo: Self.macOSRedirectURL
            ) { url in
                try await self.openMacOSOAuth(url)
            }
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            throw NativeOAuthError.cancelled
        }
        return session.accessToken
        #else
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: configuration.googleClientID,
            serverClientID: configuration.googleServerClientID
        )
        let nonce = try Self.randomNonce()
        let hashedNonce = SHA256.hash(data: Data(nonce.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        let googleTokens = try await googleSignIn(nonce: hashedNonce)
        let client = makeSupabaseClient(configuration: configuration)
        supabase = client
        let session = try await client.auth.signInWithIdToken(credentials: .init(
            provider: .google,
            idToken: googleTokens.idToken,
            accessToken: googleTokens.accessToken,
            nonce: nonce
        ))
        return session.accessToken
        #endif
    }

    func handle(_ url: URL) -> Bool {
        #if os(macOS)
        return false
        #else
        GIDSignIn.sharedInstance.handle(url)
        #endif
    }

    func signOut() async {
        #if os(iOS)
        GIDSignIn.sharedInstance.signOut()
        #endif
        if supabase == nil, let configuration = try? NativeGoogleAuthConfiguration.load() {
            supabase = makeSupabaseClient(configuration: configuration)
        }
        try? await supabase?.auth.signOut()
    }

    private func makeSupabaseClient(configuration: NativeGoogleAuthConfiguration) -> SupabaseClient {
        #if os(macOS)
        let storage: any AuthLocalStorage = EphemeralAuthStorage()
        #else
        let storage: any AuthLocalStorage = KeychainLocalStorage(service: "com.soma.native.supabase-auth")
        #endif
        return SupabaseClient(
            supabaseURL: configuration.supabaseURL,
            supabaseKey: configuration.supabasePublishableKey,
            options: .init(auth: .init(
                storage: storage,
                redirectToURL: Self.redirectURL,
                storageKey: "google-session",
                flowType: .pkce,
                autoRefreshToken: true
            ))
        )
    }

    #if os(macOS)
    private static let macOSRedirectURL = URL(string: "com.soma.native.macos://auth/callback")!
    private static let redirectURL: URL? = macOSRedirectURL

    private func openMacOSOAuth(_ url: URL) async throws -> URL {
        guard let window = NSApplication.shared.keyWindow
            ?? NSApplication.shared.mainWindow
            ?? NSApplication.shared.windows.first(where: { $0.isVisible }) else {
            throw NativeOAuthError.providerUnavailable
        }
        activeAttempt?.finish(.failure(NativeOAuthError.cancelled), cancelSession: true)
        let attempt = MacOAuthAttempt(window: window)
        activeAttempt = attempt
        defer { if activeAttempt === attempt { activeAttempt = nil } }
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                attempt.continuation = continuation
                let session = Self.makeWebAuthenticationSession(
                    url: url,
                    callbackURLScheme: Self.macOSRedirectURL.scheme!,
                    attempt: attempt
                )
                session.presentationContextProvider = attempt.presentationContext
                attempt.session = session
                attempt.timeoutTask = Task {
                    try? await Task.sleep(for: .seconds(300))
                    guard !Task.isCancelled else { return }
                    attempt.finish(.failure(NativeOAuthError.timedOut), cancelSession: true)
                }
                if !session.start() {
                    attempt.finish(.failure(NativeOAuthError.providerUnavailable))
                }
            }
        } onCancel: {
            Task { @MainActor in
                attempt.finish(.failure(CancellationError()), cancelSession: true)
            }
        }
    }

    // The callback runs on a system queue; constructing it outside MainActor avoids an executor trap.
    nonisolated private static func makeWebAuthenticationSession(
        url: URL,
        callbackURLScheme: String,
        attempt: MacOAuthAttempt
    ) -> ASWebAuthenticationSession {
        ASWebAuthenticationSession(url: url, callbackURLScheme: callbackURLScheme) { resultURL, error in
            let result: Result<URL, any Error>
            if let error { result = .failure(error) }
            else if let resultURL { result = .success(resultURL) }
            else { result = .failure(NativeGoogleSignInError.missingResult) }
            Task { @MainActor in attempt.finish(result) }
        }
    }
    #else
    private static let redirectURL: URL? = nil
    #endif

    private func googleSignIn(nonce: String) async throws -> GoogleTokens {
        try await withCheckedThrowingContinuation { continuation in
            #if os(iOS)
            guard let presenter = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .filter({ $0.activationState == .foregroundActive })
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)?.rootViewController else {
                continuation.resume(throwing: NativeGoogleSignInError.missingPresentationContext)
                return
            }
            GIDSignIn.sharedInstance.signIn(
                withPresenting: presenter,
                hint: nil,
                additionalScopes: nil,
                nonce: nonce
            ) { result, error in
                Self.resume(continuation, result: result, error: error)
            }
            #else
            guard let window = NSApplication.shared.keyWindow
                ?? NSApplication.shared.mainWindow
                ?? NSApplication.shared.windows.first(where: { $0.isVisible }) else {
                continuation.resume(throwing: NativeGoogleSignInError.missingPresentationContext)
                return
            }
            GIDSignIn.sharedInstance.signIn(
                withPresenting: window,
                hint: nil,
                additionalScopes: nil,
                nonce: nonce
            ) { result, error in
                Self.resume(continuation, result: result, error: error)
            }
            #endif
        }
    }

    nonisolated private static func resume(
        _ continuation: CheckedContinuation<GoogleTokens, any Error>,
        result: GIDSignInResult?,
        error: (any Error)?
    ) {
        if let error { continuation.resume(throwing: error) }
        else if let result, let idToken = result.user.idToken?.tokenString {
            continuation.resume(returning: GoogleTokens(
                idToken: idToken,
                accessToken: result.user.accessToken.tokenString
            ))
        }
        else if result != nil { continuation.resume(throwing: NativeGoogleSignInError.missingIDToken) }
        else { continuation.resume(throwing: NativeGoogleSignInError.missingResult) }
    }

    private static func randomNonce() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw NativeGoogleSignInError.randomGenerationFailed
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

#if os(macOS)
@MainActor
private final class MacOAuthAttempt {
    let presentationContext: NativeOAuthPresentationContext
    var session: ASWebAuthenticationSession?
    var continuation: CheckedContinuation<URL, any Error>?
    var timeoutTask: Task<Void, Never>?

    init(window: NSWindow) {
        presentationContext = NativeOAuthPresentationContext(window: window)
    }

    func finish(_ result: Result<URL, any Error>, cancelSession: Bool = false) {
        guard let continuation else { return }
        self.continuation = nil
        timeoutTask?.cancel()
        timeoutTask = nil
        let session = self.session
        self.session = nil
        if cancelSession { session?.cancel() }
        continuation.resume(with: result)
    }
}

private final class NativeOAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let window: NSWindow

    init(window: NSWindow) { self.window = window }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        window
    }
}

private final class EphemeralAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: Data] = [:]

    func store(key: String, value: Data) throws {
        lock.lock()
        defer { lock.unlock() }
        values[key] = value
    }

    func retrieve(key: String) throws -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return values[key]
    }

    func remove(key: String) throws {
        lock.lock()
        defer { lock.unlock() }
        values.removeValue(forKey: key)
    }
}
#endif

private struct GoogleTokens: Sendable {
    let idToken: String
    let accessToken: String
}

private struct NativeGoogleAuthConfiguration {
    let supabaseURL: URL
    let supabasePublishableKey: String
    let googleClientID: String
    let googleServerClientID: String

    static func load(bundle: Bundle = .main) throws -> Self {
        func value(_ key: String) throws -> String {
            guard let value = bundle.object(forInfoDictionaryKey: key) as? String,
                  !value.isEmpty,
                  !value.contains("$("),
                  !value.contains("YOUR_") else {
                throw NativeGoogleSignInError.missingConfiguration(key)
            }
            return value
        }
        guard let supabaseURL = URL(string: try value("SomaSupabaseURL")) else {
            throw NativeGoogleSignInError.missingConfiguration("SomaSupabaseURL")
        }
        return Self(
            supabaseURL: supabaseURL,
            supabasePublishableKey: try value("SomaSupabasePublishableKey"),
            googleClientID: try value("GIDClientID"),
            googleServerClientID: try value("GIDServerClientID")
        )
    }
}

enum NativeGoogleSignInError: Error {
    case missingConfiguration(String)
    case missingPresentationContext
    case missingIDToken
    case missingResult
    case randomGenerationFailed
}
