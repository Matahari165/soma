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
    private static let timeout: Duration = .seconds(300)

    private var activeSession: ASWebAuthenticationSession?
    private var activeAnchor: ASPresentationAnchor?
    private var activeAttemptID: UUID?
    private var activeContinuation: CheckedContinuation<URL, any Error>?
    private var timeoutTask: Task<Void, Never>?

    func authenticate(at url: URL, callbackScheme: String) async throws -> URL {
        finishActiveAttempt(throwing: NativeOAuthError.cancelled, cancelSession: true)
        guard let anchor = currentPresentationAnchor() else {
            throw NativeOAuthError.providerUnavailable
        }
        let attemptID = UUID()
        activeAnchor = anchor
        activeAttemptID = attemptID
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                activeContinuation = continuation
                let session = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme)) { [weak self] callbackURL, error in
                    Task { @MainActor in
                        self?.completeAttempt(attemptID, callbackURL: callbackURL, error: error)
                    }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = false
                activeSession = session
                timeoutTask = Task { [weak self] in
                    try? await Task.sleep(for: Self.timeout)
                    guard !Task.isCancelled else { return }
                    self?.finishAttempt(attemptID, throwing: NativeOAuthError.timedOut, cancelSession: true)
                }
                guard session.start() else {
                    finishAttempt(attemptID, throwing: NativeOAuthError.providerUnavailable)
                    return
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.finishAttempt(attemptID, throwing: CancellationError(), cancelSession: true)
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let anchor = activeAnchor ?? currentPresentationAnchor() else {
            preconditionFailure("The authentication session started without a presentation anchor.")
        }
        return anchor
    }

    private func completeAttempt(_ attemptID: UUID, callbackURL: URL?, error: (any Error)?) {
        if let authenticationError = error as? ASWebAuthenticationSessionError,
           authenticationError.code == .canceledLogin {
            finishAttempt(attemptID, throwing: NativeOAuthError.cancelled)
        } else if let error {
            finishAttempt(attemptID, throwing: error)
        } else if let callbackURL {
            #if os(macOS)
            activeAnchor?.makeKeyAndOrderFront(nil)
            NSApplication.shared.activate()
            #endif
            finishAttempt(attemptID, returning: callbackURL)
        } else {
            finishAttempt(attemptID, throwing: NativeOAuthError.invalidCallback)
        }
    }

    private func finishAttempt(_ attemptID: UUID, returning url: URL) {
        guard activeAttemptID == attemptID else { return }
        let continuation = clearActiveAttempt()
        continuation?.resume(returning: url)
    }

    private func finishAttempt(_ attemptID: UUID, throwing error: any Error, cancelSession: Bool = false) {
        guard activeAttemptID == attemptID else { return }
        let continuation = clearActiveAttempt(cancelSession: cancelSession)
        continuation?.resume(throwing: error)
    }

    private func finishActiveAttempt(throwing error: any Error, cancelSession: Bool) {
        guard let attemptID = activeAttemptID else { return }
        finishAttempt(attemptID, throwing: error, cancelSession: cancelSession)
    }

    private func clearActiveAttempt(cancelSession: Bool = false) -> CheckedContinuation<URL, any Error>? {
        let continuation = activeContinuation
        let session = activeSession
        timeoutTask?.cancel()
        timeoutTask = nil
        activeContinuation = nil
        activeSession = nil
        activeAnchor = nil
        activeAttemptID = nil
        if cancelSession { session?.cancel() }
        return continuation
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
