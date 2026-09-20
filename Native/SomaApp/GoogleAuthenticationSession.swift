import AuthenticationServices
import Foundation
import SomaCore
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
final class GoogleAuthenticationSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?
    private var activeAnchor: ASPresentationAnchor?

    func authenticate(at url: URL, callbackScheme: String) async throws -> URL {
        activeSession?.cancel()
        guard let anchor = currentPresentationAnchor() else {
            throw NativeOAuthError.providerUnavailable
        }
        activeAnchor = anchor
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
                self?.activeSession = nil
                self?.activeAnchor = nil
                if let authenticationError = error as? ASWebAuthenticationSessionError,
                   authenticationError.code == .canceledLogin {
                    continuation.resume(throwing: NativeOAuthError.cancelled)
                } else if let error {
                    continuation.resume(throwing: error)
                } else if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: NativeOAuthError.invalidCallback)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            guard session.start() else {
                activeSession = nil
                activeAnchor = nil
                continuation.resume(throwing: NativeOAuthError.providerUnavailable)
                return
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // The anchor is resolved before starting the session and retained for its lifetime.
        activeAnchor!
    }

    private func currentPresentationAnchor() -> ASPresentationAnchor? {
        #if os(iOS)
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        #else
        return NSApplication.shared.keyWindow
            ?? NSApplication.shared.mainWindow
            ?? NSApplication.shared.windows.first(where: { $0.isVisible })
        #endif
    }
}
