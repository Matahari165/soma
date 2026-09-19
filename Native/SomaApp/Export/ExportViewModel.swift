import Foundation
import Observation
import SomaCore

@MainActor
@Observable
final class ExportViewModel {
    enum Phase: Equatable {
        case idle
        case preparing
        case downloadingArchive(current: Int, total: Int)
        case ready
        case cancelled
        case failed(String)
    }

    var phase: Phase = .idle
    var progress: Double?
    var completedFiles: [ExportedFile] = []
    var manifest: ExportManifest?

    private let client: AccountExportClient
    private var transferTask: Task<Void, Never>?
    private var pendingArchives: [ExportArchiveReference] = []

    init(client: AccountExportClient? = nil) {
        self.client = client ?? AccountExportClient(
            baseURL: URL(string: "https://soma-neon-phi.vercel.app")!,
            tokenStore: KeychainTokenStore()
        )
    }

    var canStart: Bool {
        switch phase {
        case .preparing, .downloadingArchive: false
        default: true
        }
    }

    var isTransferring: Bool { !canStart }

    func start() {
        guard canStart else { return }
        if manifest != nil, !pendingArchives.isEmpty {
            continuePendingArchives()
            return
        }
        completedFiles = []
        manifest = nil
        pendingArchives = []
        phase = .preparing
        progress = nil
        transferTask = Task { [weak self] in
            guard let self else { return }
            do {
                let prepared = try await client.prepareExport { [weak self] update in
                    Task { @MainActor in self?.progress = update.fractionCompleted }
                }
                guard !Task.isCancelled else { throw CancellationError() }
                manifest = prepared.manifest
                completedFiles = [prepared.mainFile]
                pendingArchives = prepared.manifest.archiveDownloads
                await downloadPendingArchives()
            } catch {
                handle(error)
            }
        }
    }

    func cancel() {
        transferTask?.cancel()
        transferTask = nil
        phase = .cancelled
        progress = nil
    }

    private func continuePendingArchives() {
        phase = .downloadingArchive(
            current: max((manifest?.archiveDownloads.count ?? 0) - pendingArchives.count + 1, 1),
            total: manifest?.archiveDownloads.count ?? pendingArchives.count
        )
        transferTask = Task { [weak self] in await self?.downloadPendingArchives() }
    }

    private func downloadPendingArchives() async {
        let total = manifest?.archiveDownloads.count ?? pendingArchives.count
        do {
            while let reference = pendingArchives.first {
                let completed = total - pendingArchives.count
                phase = .downloadingArchive(current: completed + 1, total: total)
                progress = nil
                let file = try await client.downloadArchive(reference) { [weak self] update in
                    Task { @MainActor in self?.progress = update.fractionCompleted }
                }
                guard !Task.isCancelled else { throw CancellationError() }
                completedFiles.append(file)
                pendingArchives.removeFirst()
            }
            phase = .ready
            progress = 1
            transferTask = nil
        } catch {
            handle(error)
        }
    }

    private func handle(_ error: Error) {
        transferTask = nil
        progress = nil
        if error is CancellationError || error as? ExportClientError == .cancelled {
            phase = .cancelled
        } else if error as? ExportClientError == .unauthorized {
            phase = .failed("Ta session a expiré. Reconnecte-toi avant de reprendre l’export.")
        } else if manifest != nil, !pendingArchives.isEmpty {
            phase = .failed("Une archive n’a pas pu être téléchargée. Les fichiers terminés sont conservés.")
        } else {
            phase = .failed("L’export n’a pas pu être préparé. Vérifie ta connexion puis réessaie.")
        }
    }
}
