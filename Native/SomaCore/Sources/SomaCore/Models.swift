import Foundation

public struct SessionUser: Codable, Equatable, Sendable {
    public let id: String
    public let email: String?
    public let displayName: String

    public init(id: String, email: String?, displayName: String) {
        self.id = id
        self.email = email
        self.displayName = displayName
    }
}

public struct LoginResponse: Codable, Sendable {
    public let token: String
    public let tokenType: String
    public let user: SessionUser
    public let session: DeviceSession
    public let hasCompletedOnboarding: Bool
}

public struct SessionResponse: Codable, Sendable {
    public let user: SessionUser
    public let session: DeviceSession
    public let hasCompletedOnboarding: Bool
}

public enum HealthCalculationSex: String, Codable, CaseIterable, Sendable {
    case female, male, intersex
    case preferNotToSay = "prefer_not_to_say"
}

public enum FitnessGoal: String, Codable, CaseIterable, Sendable {
    case buildMuscle = "build_muscle"
    case improveEndurance = "improve_endurance"
    case improveCardio = "improve_cardio"
    case generalFitness = "general_fitness"
    case maintainHealth = "maintain_health"
    case other
}

public enum HealthImportRange: String, Codable, CaseIterable, Sendable {
    case ninetyDays = "90_days"
    case allHistory = "all_history"
}

public struct OnboardingRequest: Encodable, Equatable, Sendable {
    public let displayName: String
    public let dateOfBirth: String
    public let heightCm: Double
    public let weightKg: Double
    public let sexForHealthCalculations: HealthCalculationSex
    public let primaryGoal: FitnessGoal
    public let secondaryGoal: FitnessGoal?
    public let baseSleepTargetMinutes: Int
    public let usualWakeTime: String
    public let importRange: HealthImportRange
    public let timezone: String
    public let selectedHabits: [String]

    public init(
        displayName: String,
        dateOfBirth: String,
        heightCm: Double,
        weightKg: Double,
        sexForHealthCalculations: HealthCalculationSex,
        primaryGoal: FitnessGoal,
        secondaryGoal: FitnessGoal? = nil,
        baseSleepTargetMinutes: Int,
        usualWakeTime: String,
        importRange: HealthImportRange,
        timezone: String,
        selectedHabits: [String] = []
    ) {
        self.displayName = displayName
        self.dateOfBirth = dateOfBirth
        self.heightCm = heightCm
        self.weightKg = weightKg
        self.sexForHealthCalculations = sexForHealthCalculations
        self.primaryGoal = primaryGoal
        self.secondaryGoal = secondaryGoal
        self.baseSleepTargetMinutes = baseSleepTargetMinutes
        self.usualWakeTime = usualWakeTime
        self.importRange = importRange
        self.timezone = timezone
        self.selectedHabits = selectedHabits
    }

    private enum CodingKeys: String, CodingKey {
        case displayName, dateOfBirth, heightCm, weightKg, sexForHealthCalculations
        case primaryGoal, secondaryGoal, baseSleepTargetMinutes, usualWakeTime
        case importRange, timezone, selectedHabits, customHabits
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(displayName, forKey: .displayName)
        try container.encode(dateOfBirth, forKey: .dateOfBirth)
        try container.encode(heightCm, forKey: .heightCm)
        try container.encode(weightKg, forKey: .weightKg)
        try container.encode(sexForHealthCalculations, forKey: .sexForHealthCalculations)
        try container.encode(primaryGoal, forKey: .primaryGoal)
        try container.encodeIfPresent(secondaryGoal, forKey: .secondaryGoal)
        if secondaryGoal == nil { try container.encodeNil(forKey: .secondaryGoal) }
        try container.encode(baseSleepTargetMinutes, forKey: .baseSleepTargetMinutes)
        try container.encode(usualWakeTime, forKey: .usualWakeTime)
        try container.encode(importRange, forKey: .importRange)
        try container.encode(timezone, forKey: .timezone)
        try container.encode(selectedHabits, forKey: .selectedHabits)
        try container.encode([String](), forKey: .customHabits)
    }
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

public struct EmptyResponse: Codable, Equatable, Sendable {
    public let ok: Bool

    public init(ok: Bool) {
        self.ok = ok
    }
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
    public let status: JournalDayStatus?
    public let saved: Int?
    public let omitted: Int?
    public let day: NativeDayResponse
}

public enum JournalVariableType: String, Codable, CaseIterable, Sendable {
    case boolean, count, duration, number, scale, category, time
}

public enum JournalCaptureMode: String, Codable, CaseIterable, Sendable {
    case manual, automatic
}

public enum JournalTrackingCadence: String, Codable, CaseIterable, Sendable {
    case daily, weekly
}

public enum JournalDayPeriod: String, Codable, CaseIterable, Sendable {
    case context, morning, day, evening, sleep, other
}

public enum JournalDayStatus: String, Codable, Sendable {
    case draft, validated
}

public struct JournalVariable: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let variableType: JournalVariableType
    public let unit: String?
    public let options: [String]
    public let position: Int
    public let isActive: Bool
    public let emoji: String
    public let defaultValue: JSONValue?
    public let dayPeriod: JournalDayPeriod
    public let captureMode: JournalCaptureMode?
    public let automaticMetricId: String?
    public let trackingCadence: JournalTrackingCadence?

    public init(id: String, name: String, variableType: JournalVariableType, unit: String?, options: [String], position: Int, isActive: Bool, emoji: String, defaultValue: JSONValue?, dayPeriod: JournalDayPeriod, captureMode: JournalCaptureMode?, automaticMetricId: String?, trackingCadence: JournalTrackingCadence?) {
        self.id = id
        self.name = name
        self.variableType = variableType
        self.unit = unit
        self.options = options
        self.position = position
        self.isActive = isActive
        self.emoji = emoji
        self.defaultValue = defaultValue
        self.dayPeriod = dayPeriod
        self.captureMode = captureMode
        self.automaticMetricId = automaticMetricId
        self.trackingCadence = trackingCadence
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        variableType = try container.decode(JournalVariableType.self, forKey: .variableType)
        unit = try container.decodeIfPresent(String.self, forKey: .unit)
        options = try container.decodeIfPresent([String].self, forKey: .options) ?? []
        position = try container.decodeIfPresent(Int.self, forKey: .position) ?? 0
        isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji) ?? "🧪"
        defaultValue = try container.decodeIfPresent(JSONValue.self, forKey: .defaultValue)
        dayPeriod = try container.decodeIfPresent(JournalDayPeriod.self, forKey: .dayPeriod) ?? .day
        captureMode = try container.decodeIfPresent(JournalCaptureMode.self, forKey: .captureMode)
        automaticMetricId = try container.decodeIfPresent(String.self, forKey: .automaticMetricId)
        trackingCadence = try container.decodeIfPresent(JournalTrackingCadence.self, forKey: .trackingCadence)
    }

    public var resolvedCaptureMode: JournalCaptureMode { captureMode ?? .manual }
    public var resolvedTrackingCadence: JournalTrackingCadence { trackingCadence ?? .daily }
}

public struct JournalEntry: Codable, Equatable, Sendable {
    public let variableId: String
    public let entryDate: String
    public let value: JSONValue
    public let source: String?
}

public struct JournalDay: Codable, Equatable, Sendable {
    public let entryDate: String
    public let status: JournalDayStatus
    public let validatedAt: String?
    public let omittedVariableIds: [String]
}

public struct JournalVariableCreateRequest: Codable, Equatable, Sendable {
    public let name: String
    public let variableType: JournalVariableType
    public let unit: String?
    public let options: [String]
    public let emoji: String
    public let defaultValue: JSONValue?
    public let dayPeriod: JournalDayPeriod
    public let captureMode: JournalCaptureMode
    public let automaticMetricId: String?
    public let trackingCadence: JournalTrackingCadence

    public init(name: String, variableType: JournalVariableType, unit: String? = nil, options: [String] = [], emoji: String = "🧪", defaultValue: JSONValue? = nil, dayPeriod: JournalDayPeriod = .day, captureMode: JournalCaptureMode = .manual, automaticMetricId: String? = nil, trackingCadence: JournalTrackingCadence = .daily) {
        self.name = name
        self.variableType = variableType
        self.unit = unit
        self.options = options
        self.emoji = emoji
        self.defaultValue = defaultValue
        self.dayPeriod = dayPeriod
        self.captureMode = captureMode
        self.automaticMetricId = automaticMetricId
        self.trackingCadence = trackingCadence
    }
}

public struct JournalVariableUpdateRequest: Codable, Equatable, Sendable {
    public let id: String
    public var name: String?
    public var variableType: JournalVariableType?
    public var unit: String?
    public var options: [String]?
    public var position: Int?
    public var isActive: Bool?
    public var emoji: String?
    public var defaultValue: JSONValue?
    public var dayPeriod: JournalDayPeriod?
    public var captureMode: JournalCaptureMode?
    public var automaticMetricId: String?
    public var trackingCadence: JournalTrackingCadence?

    public init(id: String, name: String? = nil, variableType: JournalVariableType? = nil, unit: String? = nil, options: [String]? = nil, position: Int? = nil, isActive: Bool? = nil, emoji: String? = nil, defaultValue: JSONValue? = nil, dayPeriod: JournalDayPeriod? = nil, captureMode: JournalCaptureMode? = nil, automaticMetricId: String? = nil, trackingCadence: JournalTrackingCadence? = nil) {
        self.id = id
        self.name = name
        self.variableType = variableType
        self.unit = unit
        self.options = options
        self.position = position
        self.isActive = isActive
        self.emoji = emoji
        self.defaultValue = defaultValue
        self.dayPeriod = dayPeriod
        self.captureMode = captureMode
        self.automaticMetricId = automaticMetricId
        self.trackingCadence = trackingCadence
    }
}

/// The complete editable definition of a variable. Unlike a partial update,
/// optional values are deliberately encoded as `null` so an existing unit or
/// default can be cleared without affecting reorder/archive requests.
public struct JournalVariableDefinitionUpdateRequest: Encodable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let variableType: JournalVariableType?
    public let unit: String?
    public let options: [String]?
    public let emoji: String
    public let defaultValue: JSONValue?
    public let dayPeriod: JournalDayPeriod
    public let trackingCadence: JournalTrackingCadence

    public init(id: String, name: String, variableType: JournalVariableType? = nil, unit: String?, options: [String]?, emoji: String, defaultValue: JSONValue?, dayPeriod: JournalDayPeriod, trackingCadence: JournalTrackingCadence) {
        self.id = id
        self.name = name
        self.variableType = variableType
        self.unit = unit
        self.options = options
        self.emoji = emoji
        self.defaultValue = defaultValue
        self.dayPeriod = dayPeriod
        self.trackingCadence = trackingCadence
    }

    enum CodingKeys: String, CodingKey {
        case id, name, variableType, unit, options, emoji, defaultValue, dayPeriod, trackingCadence
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(variableType, forKey: .variableType)
        if let unit { try container.encode(unit, forKey: .unit) } else { try container.encodeNil(forKey: .unit) }
        try container.encodeIfPresent(options, forKey: .options)
        try container.encode(emoji, forKey: .emoji)
        if let defaultValue { try container.encode(defaultValue, forKey: .defaultValue) } else { try container.encodeNil(forKey: .defaultValue) }
        try container.encode(dayPeriod, forKey: .dayPeriod)
        try container.encode(trackingCadence, forKey: .trackingCadence)
    }
}

public struct JournalVariableMutationResponse: Codable, Equatable, Sendable {
    public let ok: Bool
    public let id: String?
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
