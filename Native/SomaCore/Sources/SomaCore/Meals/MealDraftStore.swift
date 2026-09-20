import Foundation

public actor MealDraftStore {
    private let directory: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(directory: URL? = nil, fileManager: FileManager = .default) throws {
        self.fileManager = fileManager
        if let directory { self.directory = directory }
        else {
            guard let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw MealDraftStoreError.applicationSupportUnavailable }
            self.directory = applicationSupport.appending(path: "Soma/MealDrafts", directoryHint: .isDirectory)
        }
        self.encoder = JSONEncoder(); self.decoder = JSONDecoder()
        try fileManager.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    public func load(_ id: UUID, ownerUserID: String? = nil) throws -> MealDraft? {
        let url = fileURL(id, ownerUserID: ownerUserID)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try decoder.decode(MealDraft.self, from: Data(contentsOf: url))
    }

    public func loadAll(ownerUserID: String? = nil) throws -> [MealDraft] {
        let source = ownerUserID.map(namespaceDirectory) ?? directory
        guard fileManager.fileExists(atPath: source.path) else { return [] }
        return try fileManager.contentsOfDirectory(at: source, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .map { try decoder.decode(MealDraft.self, from: Data(contentsOf: $0)) }
    }

    public func save(_ draft: MealDraft) throws {
        let data = try encoder.encode(draft)
        let targetDirectory = draft.ownerUserID.map(namespaceDirectory) ?? directory
        try fileManager.createDirectory(at: targetDirectory, withIntermediateDirectories: true)
        try data.write(to: fileURL(draft.id, ownerUserID: draft.ownerUserID), options: .atomic)
    }

    public func remove(_ id: UUID, ownerUserID: String? = nil) throws {
        let url = fileURL(id, ownerUserID: ownerUserID)
        if fileManager.fileExists(atPath: url.path) { try fileManager.removeItem(at: url) }
    }

    /// Remove all drafts and their copied photo files for one account. This is
    /// deliberately account scoped so a later login can never see another
    /// account's local evidence.
    @discardableResult
    public func removeAll(ownerUserID: String) throws -> Int {
        let drafts = try loadAll(ownerUserID: ownerUserID)
        for draft in drafts {
            for photo in draft.photos { try? fileManager.removeItem(at: photo.fileURL) }
            try? fileManager.removeItem(at: draftPhotoDirectory(draft.id))
        }
        let namespace = namespaceDirectory(ownerUserID)
        if fileManager.fileExists(atPath: namespace.path) { try? fileManager.removeItem(at: namespace) }
        return drafts.count
    }

    private func namespaceDirectory(_ ownerUserID: String) -> URL {
        directory.appending(path: "user-\(safeNamespace(ownerUserID))", directoryHint: .isDirectory)
    }

    private func draftPhotoDirectory(_ id: UUID) -> URL {
        directory.deletingLastPathComponent().appending(path: "MealDraftPhotos/\(id.uuidString.lowercased())", directoryHint: .isDirectory)
    }

    private func fileURL(_ id: UUID, ownerUserID: String?) -> URL {
        (ownerUserID.map(namespaceDirectory) ?? directory).appending(path: "\(id.uuidString.lowercased()).json")
    }

    private func safeNamespace(_ value: String) -> String {
        let result = value.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }.joined()
        return result.isEmpty ? "unknown" : String(result.prefix(120))
    }
}

public enum MealDraftStoreError: Error, Sendable { case applicationSupportUnavailable }
