import Foundation

public struct ExportManifest: Codable, Equatable, Sendable {
    public let exportedAt: String
    public let preview: Bool?
    public let archiveDownloads: [ExportArchiveReference]
    public let mealPhotoDownloads: [ExportMealPhotoReference]

    private enum CodingKeys: String, CodingKey {
        case exportedAt
        case preview
        case archiveDownloads
        case mealPhotoDownloads
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        exportedAt = try values.decode(String.self, forKey: .exportedAt)
        preview = try values.decodeIfPresent(Bool.self, forKey: .preview)
        archiveDownloads = try values.decodeIfPresent([ExportArchiveReference].self, forKey: .archiveDownloads) ?? []
        mealPhotoDownloads = try values.decodeIfPresent([ExportMealPhotoReference].self, forKey: .mealPhotoDownloads) ?? []
    }
}

public struct ExportArchiveReference: Codable, Identifiable, Equatable, Sendable {
    public let path: String
    public let signedUrl: String

    public var id: String { path }
}

public struct ExportMealPhotoReference: Codable, Identifiable, Equatable, Sendable {
    public let mealId: String
    public let photoId: String
    public let path: String

    public var id: String { photoId }
}

public struct ExportedFile: Identifiable, Equatable, Sendable {
    public let url: URL
    public let byteCount: Int64?

    public var id: URL { url }
    public var filename: String { url.lastPathComponent }
}

public struct PreparedExport: Equatable, Sendable {
    public let manifest: ExportManifest
    public let mainFile: ExportedFile
}

public struct ExportDownloadProgress: Equatable, Sendable {
    public let completedBytes: Int64
    public let totalBytes: Int64?

    public var fractionCompleted: Double? {
        guard let totalBytes, totalBytes > 0 else { return nil }
        return min(max(Double(completedBytes) / Double(totalBytes), 0), 1)
    }
}

public enum ExportClientError: Error, Equatable, Sendable {
    case invalidURL
    case invalidResponse
    case unauthorized
    case http(Int)
    case invalidExport
    case cancelled
}
