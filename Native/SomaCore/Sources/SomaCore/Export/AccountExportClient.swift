import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public actor AccountExportClient {
    public typealias ProgressHandler = @Sendable (ExportDownloadProgress) -> Void

    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: any TokenStore
    private let exportDirectory: URL

    public init(
        baseURL: URL,
        session: URLSession = .shared,
        tokenStore: any TokenStore,
        exportDirectory: URL? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenStore = tokenStore
        self.exportDirectory = exportDirectory ?? URL.applicationSupportDirectory
            .appending(path: "Soma/Exports", directoryHint: .isDirectory)
    }

    public func prepareExport(progress: @escaping ProgressHandler) async throws -> PreparedExport {
        let request = try authenticatedRequest(path: "/api/native/v1/account/export")
        let downloaded = try await download(request: request, suggestedFilename: "soma-export.json", progress: progress)
        do {
            let manifest = try JSONDecoder().decode(ExportManifest.self, from: Data(contentsOf: downloaded.url))
            return PreparedExport(manifest: manifest, mainFile: downloaded)
        } catch {
            try? FileManager.default.removeItem(at: downloaded.url)
            throw ExportClientError.invalidExport
        }
    }

    public func downloadArchive(
        _ reference: ExportArchiveReference,
        progress: @escaping ProgressHandler
    ) async throws -> ExportedFile {
        let request = try archiveRequest(objectPath: reference.path)
        let fallback = reference.path.split(separator: "/").last.map(String.init) ?? "soma-archive"
        return try await download(request: request, suggestedFilename: fallback, progress: progress)
    }

    private func authenticatedRequest(path: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw ExportClientError.invalidURL }
        guard let token = try tokenStore.read() else { throw ExportClientError.unauthorized }
        var request = URLRequest(url: url)
        request.setValue("application/json, application/octet-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return request
    }

    private func archiveRequest(objectPath: String) throws -> URLRequest {
        let url = try Self.archiveURL(baseURL: baseURL, objectPath: objectPath)
        return try authenticatedRequest(path: url.relativeString)
    }

    public static func archiveURL(baseURL: URL, objectPath: String) throws -> URL {
        guard var components = URLComponents(
            url: baseURL.appending(path: "/api/native/v1/account/archive"),
            resolvingAgainstBaseURL: false
        ) else { throw ExportClientError.invalidURL }
        components.queryItems = [URLQueryItem(name: "key", value: objectPath)]
        guard let url = components.url else { throw ExportClientError.invalidURL }
        return url
    }

    private func download(
        request: URLRequest,
        suggestedFilename: String,
        progress: @escaping ProgressHandler
    ) async throws -> ExportedFile {
        let delegate = ExportProgressDelegate(progress: progress)
        let temporaryURL: URL
        let response: URLResponse
        do {
            (temporaryURL, response) = try await session.download(for: request, delegate: delegate)
        } catch is CancellationError {
            throw ExportClientError.cancelled
        } catch let error as URLError where error.code == .cancelled {
            throw ExportClientError.cancelled
        }
        guard let http = response as? HTTPURLResponse else { throw ExportClientError.invalidResponse }
        if http.statusCode == 401 {
            try? tokenStore.clear()
            throw ExportClientError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else { throw ExportClientError.http(http.statusCode) }

        let filename = Self.safeFilename(response.suggestedFilename ?? suggestedFilename)
        try FileManager.default.createDirectory(at: exportDirectory, withIntermediateDirectories: true)
        let destination = Self.uniqueDestination(named: filename, in: exportDirectory)
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: destination.path
        )
        #endif
        let byteCount = try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize.map(Int64.init)
        return ExportedFile(url: destination, byteCount: byteCount ?? nil)
    }

    public static func safeFilename(_ value: String) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:\0\n\r\t")
        let cleaned = value.components(separatedBy: forbidden).joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "soma-export" : String(cleaned.prefix(180))
    }

    private static func uniqueDestination(named filename: String, in directory: URL) -> URL {
        let proposed = directory.appending(path: filename)
        guard FileManager.default.fileExists(atPath: proposed.path) else { return proposed }
        let extensionName = proposed.pathExtension
        let stem = proposed.deletingPathExtension().lastPathComponent
        let suffix = ISO8601DateFormatter().string(from: .now).replacing(":", with: "-")
        let revisedName = extensionName.isEmpty ? "\(stem)-\(suffix)" : "\(stem)-\(suffix).\(extensionName)"
        return directory.appending(path: revisedName)
    }
}

private final class ExportProgressDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let progress: AccountExportClient.ProgressHandler

    init(progress: @escaping AccountExportClient.ProgressHandler) {
        self.progress = progress
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        let total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil
        progress(ExportDownloadProgress(completedBytes: totalBytesWritten, totalBytes: total))
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {}
}
