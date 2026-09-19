import Foundation

public struct SessionUser: Codable, Equatable, Sendable {
    public let id: String
    public let email: String?
    public let displayName: String
}

public struct LoginResponse: Codable, Sendable {
    public let token: String
    public let tokenType: String
    public let user: SessionUser
}

public struct SessionResponse: Codable, Sendable {
    public let user: SessionUser
}

public struct JournalSaveEntry: Codable, Equatable, Sendable {
    public let variableId: String
    public let value: JSONValue

    public init(variableId: String, value: JSONValue) {
        self.variableId = variableId
        self.value = value
    }
}

public struct JournalSaveRequest: Codable, Equatable, Sendable {
    public let entryDate: String
    public let mode: String
    public let entries: [JournalSaveEntry]

    public init(entryDate: String, mode: String = "draft", entries: [JournalSaveEntry]) {
        self.entryDate = entryDate
        self.mode = mode
        self.entries = entries
    }
}

public struct JournalSaveResponse: Codable, Sendable {
    public let ok: Bool
    public let day: NativeDayResponse
}

public struct JournalVariable: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let variableType: String
    public let unit: String?
    public let options: [String]
    public let isActive: Bool
    public let captureMode: String?
    public let automaticMetricId: String?
}

public struct JournalEntry: Codable, Equatable, Sendable {
    public let variableId: String
    public let entryDate: String
    public let value: JSONValue
}

public struct JournalDay: Codable, Equatable, Sendable {
    public let entryDate: String
    public let status: String
    public let omittedVariableIds: [String]
}

public struct MealSummary: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let mealDate: String
    public let mealType: String
    public let status: String
    public let entryState: String
    public let note: String?
}

public enum MealType: String, Codable, CaseIterable, Sendable { case breakfast, lunch, dinner, snack }
public enum MealEntryState: String, Codable, Sendable { case recorded, skipped }
public enum MealStatus: String, Codable, Sendable { case draft, confirmed }
public enum MealPhotoOrigin: String, Codable, Sendable { case homemade, prepared, mixed, unknown }

public struct MealPhoto: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let mealId: String
    public let origin: MealPhotoOrigin
    public let mimeType: String
    public let bytes: Int
    public let filename: String?
    public let createdAt: String
    public let storageStatus: String?
    public let purgedAt: String?
    public let url: String?
}

public struct MealAnalysisRecord: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let mealId: String
    public let status: String
    public let provider: String
    public let model: String
    public let result: JSONValue?
    public let error: String?
    public let errorCode: String?
    public let sourcePhotoIds: [String]
    public let createdAt: String
    public let completedAt: String?
}

public struct Meal: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let mealDate: String
    public let mealType: MealType
    public let note: String?
    public let status: MealStatus
    public let entryState: MealEntryState
    public let mouthWarmthIntensity: Int?
    public let stomachOverfullIntensity: Int?
    public let createdAt: String
    public let updatedAt: String
    public let photos: [MealPhoto]
    public let analysis: MealAnalysisRecord?
    public let lastSuccessfulAnalysis: MealAnalysisRecord?
}

public struct MealSlots: Codable, Equatable, Sendable {
    public let breakfast: MealSummary?
    public let lunch: MealSummary?
    public let dinner: MealSummary?
    public let snack: MealSummary?

    public var ordered: [(String, MealSummary?)] {
        [("Petit-déjeuner", breakfast), ("Déjeuner", lunch), ("Dîner", dinner), ("Collation", snack)]
    }
}

public struct NativeDayResponse: Codable, Equatable, Sendable {
    public let date: String
    public let timezone: String
    public let journal: NativeJournalPayload
    public let meals: MealSlots

    public var variables: [JournalVariable] { journal.variables }
    public var entries: [JournalEntry] { journal.entries }
    public var day: JournalDay? { journal.day }
}

public struct NativeJournalPayload: Codable, Equatable, Sendable {
    public let variables: [JournalVariable]
    public let entries: [JournalEntry]
    public let day: JournalDay?
}

public struct MatrixRelation: Codable, Identifiable, Equatable, Sendable {
    public let predictorId: String
    public let outcomeId: String
    public let predictorLabel: String?
    public let outcomeLabel: String?
    public let effect: Double?
    public let sampleSize: Int
    public let effectConfidenceLow: Double?
    public let effectConfidenceHigh: Double?
    public let effectiveSampleSize: Double?
    public let pValue: Double?
    public let qValue: Double?
    public let lagDays: Int?
    public let grain: String?
    public let timeScale: String?
    public let period: JSONValue?
    public let evidence: String?
    public let coverageBySource: [MatrixSourceCoverage]?

    public var id: String {
        let periodKey: String
        switch period {
        case .number(let value): periodKey = String(value)
        case .string(let value): periodKey = value
        default: periodKey = "unknown"
        }
        return "\(predictorId):\(outcomeId):\(lagDays ?? 0):\(periodKey)"
    }
}

public struct MatrixSourceCoverage: Codable, Equatable, Sendable {
    public let source: String
    public let pairedDays: Int
    public let pairedWeeks: Int
}

public struct NativeMatrixResponse: Codable, Equatable, Sendable {
    public let rows: [MatrixRow]
    public let outcomes: [MatrixOutcome]
    public let periods: [JSONValue]

    public var relations: [MatrixRelation] { rows.flatMap(\.relations) }
}

public struct MatrixRow: Codable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let relations: [MatrixRelation]
}

public struct MatrixOutcome: Codable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let unit: String
}
