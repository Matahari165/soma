import Foundation

public struct MealDraftPhoto: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public var fileURL: URL
    public var filename: String
    public var mimeType: String
    public var origin: MealPhotoOrigin

    public init(id: UUID = UUID(), fileURL: URL, filename: String, mimeType: String, origin: MealPhotoOrigin) {
        self.id = id; self.fileURL = fileURL; self.filename = filename; self.mimeType = mimeType; self.origin = origin
    }
}

public enum MealDraftStage: String, Codable, Sendable {
    case local, creating, uploading, requestingAnalysis, polling, completed, failed
}

public struct MealDraft: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public var mealDate: String
    public var mealType: MealType
    public var note: String?
    public var entryState: MealEntryState
    public var mouthWarmthIntensity: Int?
    public var stomachOverfullIntensity: Int?
    public var photos: [MealDraftPhoto]
    public var remoteMealId: String?
    public var uploadedPhotoDraftIDs: Set<UUID>
    public var stage: MealDraftStage
    public var lastError: String?
    public let createIdempotencyKey: String
    public let uploadIdempotencyKey: String
    public let analysisIdempotencyKey: String

    public init(id: UUID = UUID(), mealDate: String, mealType: MealType, note: String? = nil, entryState: MealEntryState = .recorded, mouthWarmthIntensity: Int? = nil, stomachOverfullIntensity: Int? = nil, photos: [MealDraftPhoto] = []) {
        self.id = id; self.mealDate = mealDate; self.mealType = mealType; self.note = note
        self.entryState = entryState; self.mouthWarmthIntensity = mouthWarmthIntensity; self.stomachOverfullIntensity = stomachOverfullIntensity; self.photos = photos
        self.remoteMealId = nil; self.uploadedPhotoDraftIDs = []; self.stage = .local; self.lastError = nil
        self.createIdempotencyKey = "meal-create-\(id.uuidString.lowercased())"
        self.uploadIdempotencyKey = "meal-upload-\(id.uuidString.lowercased())"
        self.analysisIdempotencyKey = "meal-analysis-\(id.uuidString.lowercased())"
    }
}
