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
    public let session: DeviceSession
}

public struct SessionResponse: Codable, Sendable {
    public let user: SessionUser
    public let session: DeviceSession
}

public enum SessionPlatform: String, Codable, Sendable {
    case web, ios, macos
}

public struct DeviceSession: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let platform: SessionPlatform
    public let deviceName: String
    public let createdAt: Date
    public let expiresAt: Date

    public init(id: String, platform: SessionPlatform, deviceName: String, createdAt: Date, expiresAt: Date) {
        self.id = id
        self.platform = platform
        self.deviceName = deviceName
        self.createdAt = createdAt
        self.expiresAt = expiresAt
    }
}

public struct DeviceSessionsResponse: Codable, Equatable, Sendable {
    public let sessions: [DeviceSession]
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

public enum MealType: String, Codable, CaseIterable, Sendable {
    case breakfast, lunch, dinner, snack

    public var sortOrder: Int {
        switch self {
        case .breakfast: 0
        case .lunch: 1
        case .dinner: 2
        case .snack: 3
        }
    }
}
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
    public let result: MealAnalysisResult?
    public let error: String?
    public let errorCode: String?
    public let sourcePhotoIds: [String]
    public let createdAt: String
    public let completedAt: String?
}

public struct NutritionRange: Codable, Equatable, Sendable {
    public let low: Double
    public let likely: Double
    public let high: Double
}

public struct MealNutritionTotals: Codable, Equatable, Sendable {
    public let calories: NutritionRange?
    public let proteinGrams: NutritionRange?
    public let carbohydrateGrams: NutritionRange?
    public let fatGrams: NutritionRange?
    public let fiberGrams: NutritionRange?
    public let sugarGrams: NutritionRange?
    public let addedSugarGrams: NutritionRange?
}

public struct MealFoodResult: Codable, Equatable, Sendable {
    public let name: String
    public let preparation: String?
    public let portion: String?
    public let confidence: String
}

public struct MealAnalysisResult: Codable, Equatable, Sendable {
    public let summary: String
    public let dishType: String?
    public let calorieAnalysis: String?
    public let foods: [MealFoodResult]
    public let totals: MealNutritionTotals
    public let confidence: String
    public let uncertainties: [String]
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

public struct MealListResponse: Codable, Equatable, Sendable {
    public let meals: [Meal]
}

public struct MealResponse: Codable, Equatable, Sendable {
    public let meal: Meal
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
    public let predictorUnit: String?
    public let predictorKind: String?
    public let predictorPresentation: String?
    public let predictorLow: Double?
    public let predictorHigh: Double?
    public let predictorDelta: Double?
    public let outcomeLabel: String?
    public let outcomeUnit: String?
    public let coefficient: Double?
    public let effect: Double?
    public let sampleSize: Int
    public let effectConfidenceLow: Double?
    public let effectConfidenceHigh: Double?
    public let effectiveSampleSize: Double?
    public let pValue: Double?
    public let qValue: Double?
    public let percentEffect: Double?
    public let baselineMean: Double?
    public let comparisonMean: Double?
    public let baselineCount: Int?
    public let comparisonCount: Int?
    public let comparisonLabel: String?
    public let modelType: String?
    public let modelImprovement: Double?
    public let nonlinearTested: Bool?
    public let lagDays: Int?
    public let grain: String?
    public let timeScale: String?
    public let period: AnalysisPeriod?
    public let family: String?
    public let method: String?
    public let evidence: String?
    public let stable: Bool?
    public let stability: MatrixStability?
    public let strength: String?
    public let coverageBySource: [MatrixSourceCoverage]?
    public let sourceEstimates: [MatrixSourceEstimate]?
    public let doseResponse: MatrixDoseResponse?
    public let habitualPredictorDelta: Double?
    public let habitualEffect: Double?
    public let minimumDaysRemaining: Int?
    public let practicallyMeaningful: Bool?
    public let practicalThreshold: Double?
    public let practicalRatio: Double?
    public let featureEligible: Bool?
    public let exclusionReasons: [String]?
    public let excluded: Bool?

    public var id: String {
        let periodKey: String
        periodKey = period?.queryValue ?? "unknown"
        return "\(predictorId):\(outcomeId):\(lagDays ?? 0):\(periodKey)"
    }
}

public enum AnalysisPeriod: Codable, Equatable, Sendable {
    case days(Int)
    case all

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Int.self), [15, 30, 90].contains(value) { self = .days(value); return }
        if let value = try? container.decode(String.self), value == "all" { self = .all; return }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported analysis period")
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self { case .days(let value): try container.encode(value); case .all: try container.encode("all") }
    }

    public var queryValue: String { switch self { case .days(let value): String(value); case .all: "all" } }
}

public struct MatrixStability: Codable, Equatable, Sendable {
    public let chronologicalBlocks: Int
    public let directionHeldInBlocks: Bool
    public let trendAdjustedDirectionHeld: Bool
    public let outlierAdjustedDirectionHeld: Bool
}

public struct MatrixDoseResponse: Codable, Equatable, Sendable {
    public let comparisonLabel: String
    public let effect: Double
    public let effectConfidenceLow: Double
    public let effectConfidenceHigh: Double
    public let percentEffect: Double?
    public let baselineMean: Double
    public let comparisonMean: Double
    public let sampleSize: Int
    public let pValue: Double
    public let modelType: String
    public let modelImprovement: Double
    public let nonlinearTested: Bool
}

public struct MatrixSourceCoverage: Codable, Equatable, Sendable {
    public let source: String
    public let pairedDays: Int
    public let pairedWeeks: Int
}

public struct MatrixSourceEstimate: Codable, Equatable, Sendable {
    public let source: String
    public let sampleSize: Int
    public let effect: Double
    public let effectConfidenceLow: Double
    public let effectConfidenceHigh: Double
    public let coefficient: Double
    public let pValue: Double
}

public struct NativeMatrixResponse: Codable, Equatable, Sendable {
    public let period: AnalysisPeriod?
    public let rows: [MatrixRow]
    public let outcomes: [MatrixOutcome]
    public let periods: [AnalysisPeriod]
    public let meaningfulRelations: [MatrixRelation]?
    public let topRelations: [MatrixRelation]?
    public let acuteHighlights: [MatrixRelation]?
    public let chronicHighlights: [MatrixRelation]?
    public let coverageByMetric: [MatrixMetricCoverage]?
    public let collectionProgress: [MatrixMetricCoverage]?

    public var relations: [MatrixRelation] { rows.flatMap(\.relations) }
    public var strongestRelations: [MatrixRelation] { topRelations ?? meaningfulRelations ?? [] }
}

public struct MatrixMetricCoverage: Codable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let recordedDays: Int
    public let requiredDays: Int
    public let sources: [MatrixMetricSource]
}

public struct MatrixMetricSource: Codable, Equatable, Sendable {
    public let source: String
    public let days: Int
}

public struct MatrixRow: Codable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let emoji: String?
    public let grain: String?
    public let timeScale: String?
    public let period: AnalysisPeriod?
    public let lagLabel: String?
    public let relations: [MatrixRelation]
}

public struct MatrixOutcome: Codable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let unit: String
    public let direction: String?
}
