import Foundation

public struct MealDraftPhoto: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public var fileURL: URL
    public var filename: String
    public var mimeType: String
    public var origin: MealPhotoOrigin
    public var comment: String?
    public var uploadIdempotencyKey: String { "meal-photo-\(id.uuidString.lowercased())" }

    public init(id: UUID = UUID(), fileURL: URL, filename: String, mimeType: String, origin: MealPhotoOrigin, comment: String? = nil) {
        self.id = id; self.fileURL = fileURL; self.filename = filename; self.mimeType = mimeType; self.origin = origin; self.comment = comment
    }
}

public enum MealDraftStage: String, Codable, Sendable {
    case local, creating, uploading, requestingAnalysis, polling, awaitingConfirmation, confirmed, failed
    /// Legacy value kept so drafts written by the previous app remain readable.
    case completed

    public var isResumable: Bool {
        [.creating, .uploading, .requestingAnalysis, .polling].contains(self)
    }
}

public struct MealDraft: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    /// The authenticated account that owns this local draft. Nil is retained only for old files.
    public var ownerUserID: String?
    public var mealDate: String
    public var mealType: MealType
    public var note: String?
    public var entryState: MealEntryState
    public var mouthWarmthIntensity: Int?
    public var stomachOverfullIntensity: Int?
    public var photos: [MealDraftPhoto]
    public var remoteMealId: String?
    public var uploadedPhotoDraftIDs: Set<UUID>
    public var remotePhotoIDsByDraftID: [UUID: String]?
    public var hasRemotePhotoEvidence: Bool?
    public var stage: MealDraftStage
    public var lastError: String?
    public let createIdempotencyKey: String
    public let analysisIdempotencyKey: String
    public var activeAnalysisRequestId: String?
    public var analysisSourceRevision: String?
    public var analysisSourceFingerprint: String?

    public init(id: UUID = UUID(), ownerUserID: String? = nil, mealDate: String, mealType: MealType, note: String? = nil, entryState: MealEntryState = .recorded, mouthWarmthIntensity: Int? = nil, stomachOverfullIntensity: Int? = nil, photos: [MealDraftPhoto] = []) {
        self.id = id; self.ownerUserID = ownerUserID; self.mealDate = mealDate; self.mealType = mealType; self.note = note
        self.entryState = entryState; self.mouthWarmthIntensity = mouthWarmthIntensity; self.stomachOverfullIntensity = stomachOverfullIntensity; self.photos = photos
        self.remoteMealId = nil; self.uploadedPhotoDraftIDs = []; self.remotePhotoIDsByDraftID = [:]; self.hasRemotePhotoEvidence = nil; self.stage = .local; self.lastError = nil
        self.createIdempotencyKey = "meal-create-\(id.uuidString.lowercased())"
        self.analysisIdempotencyKey = "meal-analysis-\(id.uuidString.lowercased())"
        self.activeAnalysisRequestId = nil; self.analysisSourceRevision = nil; self.analysisSourceFingerprint = nil
    }
}
