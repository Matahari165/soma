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

    public func load(_ id: UUID) throws -> MealDraft? {
        let url = fileURL(id)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try decoder.decode(MealDraft.self, from: Data(contentsOf: url))
    }

    public func loadAll() throws -> [MealDraft] {
        try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .map { try decoder.decode(MealDraft.self, from: Data(contentsOf: $0)) }
    }

    public func save(_ draft: MealDraft) throws {
        let data = try encoder.encode(draft)
        try data.write(to: fileURL(draft.id), options: .atomic)
    }

    public func remove(_ id: UUID) throws {
        let url = fileURL(id)
        if fileManager.fileExists(atPath: url.path) { try fileManager.removeItem(at: url) }
    }

    private func fileURL(_ id: UUID) -> URL { directory.appending(path: "\(id.uuidString.lowercased()).json") }
}

public enum MealDraftStoreError: Error, Sendable { case applicationSupportUnavailable }
