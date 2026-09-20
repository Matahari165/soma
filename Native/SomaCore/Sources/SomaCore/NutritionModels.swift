import Foundation

/// Server-canonical nutrition payload consumed by the native Meals screen.
///
/// The native client deliberately treats optional numbers as measurements: a
/// missing value stays nil and an explicit 0 decodes as 0. The client never
/// fills missing nutrition values or recomputes the score locally.
public struct NativeNutritionResponse: Codable, Equatable, Sendable {
    public let date: String
    public let timezone: String
    public let period: NutritionPeriod
    public let score: NutritionScore?
    public let rolling: [NutritionRollingScore]
    public let scoreTrend: [NutritionScoreTrendPoint]
    public let daily: NutritionDailyAggregate?
    public let nutritionHistory: [NutritionTrendMetric]
    public let foodGroupHistory: [NutritionFoodGroupPoint]
    public let targets: NutritionTargetState?
    public let supplements: NutritionSupplements
    public let recipes: [NutritionRecipe]
    public let provenance: NutritionProvenance
    public let errors: [NutritionSectionError]

    public init(
        date: String,
        timezone: String,
        period: NutritionPeriod,
        score: NutritionScore?,
        rolling: [NutritionRollingScore],
        scoreTrend: [NutritionScoreTrendPoint],
        daily: NutritionDailyAggregate?,
        nutritionHistory: [NutritionTrendMetric],
        foodGroupHistory: [NutritionFoodGroupPoint],
        targets: NutritionTargetState?,
        supplements: NutritionSupplements = .empty,
        recipes: [NutritionRecipe] = [],
        provenance: NutritionProvenance,
        errors: [NutritionSectionError] = []
    ) {
        self.date = date
        self.timezone = timezone
        self.period = period
        self.score = score
        self.rolling = rolling
        self.scoreTrend = scoreTrend
        self.daily = daily
        self.nutritionHistory = nutritionHistory
        self.foodGroupHistory = foodGroupHistory
        self.targets = targets
        self.supplements = supplements
        self.recipes = recipes
        self.provenance = provenance
        self.errors = errors
    }
}

public struct NutritionPeriod: Codable, Equatable, Sendable {
    public let from: String
    public let to: String
    public let days: Int

    public init(from: String, to: String, days: Int) {
        self.from = from
        self.to = to
        self.days = days
    }
}

public struct NutritionScore: Codable, Equatable, Sendable {
    public let algorithmVersion: String
    public let value: Double?
    public let rawValue: Double?
    public let status: String
    public let confidence: Double
    public let observedDimensions: Int
    public let components: [NutritionScoreComponent]
    public let strongestEffects: [NutritionScoreEffect]
    public let reasons: [String]

    public init(
        algorithmVersion: String,
        value: Double?,
        rawValue: Double?,
        status: String,
        confidence: Double,
        observedDimensions: Int,
        components: [NutritionScoreComponent],
        strongestEffects: [NutritionScoreEffect],
        reasons: [String]
    ) {
        self.algorithmVersion = algorithmVersion
        self.value = value
        self.rawValue = rawValue
        self.status = status
        self.confidence = confidence
        self.observedDimensions = observedDimensions
        self.components = components
        self.strongestEffects = strongestEffects
        self.reasons = reasons
    }
}

public struct NutritionScoreComponent: Codable, Equatable, Sendable {
    public let key: String
    public let label: String
    public let score: Double?
    public let rawScore: Double?
    public let adjustedScore: Double?
    public let weight: Double
    public let contribution: Double
    public let rawContribution: Double
    public let severityPenalty: Double
    public let observationCoverage: Double
    public let confidence: Double
    public let status: String
    public let observedValue: JSONValue?
    public let target: String?
    public let summary: String
    public let period: NutritionScorePeriod?
    public let subcomponents: [NutritionScoreSubcomponent]

    public init(
        key: String,
        label: String,
        score: Double?,
        rawScore: Double?,
        adjustedScore: Double?,
        weight: Double,
        contribution: Double,
        rawContribution: Double,
        severityPenalty: Double,
        observationCoverage: Double,
        confidence: Double,
        status: String,
        observedValue: JSONValue?,
        target: String?,
        summary: String,
        period: NutritionScorePeriod?,
        subcomponents: [NutritionScoreSubcomponent]
    ) {
        self.key = key
        self.label = label
        self.score = score
        self.rawScore = rawScore
        self.adjustedScore = adjustedScore
        self.weight = weight
        self.contribution = contribution
        self.rawContribution = rawContribution
        self.severityPenalty = severityPenalty
        self.observationCoverage = observationCoverage
        self.confidence = confidence
        self.status = status
        self.observedValue = observedValue
        self.target = target
        self.summary = summary
        self.period = period
        self.subcomponents = subcomponents
    }
}

public struct NutritionScoreSubcomponent: Codable, Equatable, Sendable {
    public let key: String
    public let label: String
    public let score: Double?
    public let rawScore: Double?
    public let adjustedScore: Double?
    public let weight: Double
    public let observedValue: JSONValue?
    public let target: String?
    public let confidence: Double
    public let summary: String

    public init(
        key: String,
        label: String,
        score: Double?,
        rawScore: Double?,
        adjustedScore: Double?,
        weight: Double,
        observedValue: JSONValue?,
        target: String?,
        confidence: Double,
        summary: String
    ) {
        self.key = key
        self.label = label
        self.score = score
        self.rawScore = rawScore
        self.adjustedScore = adjustedScore
        self.weight = weight
        self.observedValue = observedValue
        self.target = target
        self.confidence = confidence
        self.summary = summary
    }
}

public struct NutritionScorePeriod: Codable, Equatable, Sendable {
    public let from: String
    public let to: String

    public init(from: String, to: String) {
        self.from = from
        self.to = to
    }
}

public struct NutritionScoreEffect: Codable, Equatable, Sendable {
    public let key: String
    public let label: String
    public let direction: String
    public let points: Double
    public let summary: String

    public init(key: String, label: String, direction: String, points: Double, summary: String) {
        self.key = key
        self.label = label
        self.direction = direction
        self.points = points
        self.summary = summary
    }
}

public struct NutritionRollingScore: Codable, Equatable, Sendable {
    public let days: Int
    public let score: Double?
    public let observedDays: Int
    public let readyDays: Int
    public let totalDays: Int

    public init(days: Int, score: Double?, observedDays: Int, readyDays: Int, totalDays: Int) {
        self.days = days
        self.score = score
        self.observedDays = observedDays
        self.readyDays = readyDays
        self.totalDays = totalDays
    }
}

public struct NutritionScoreTrendPoint: Codable, Equatable, Sendable {
    public let date: String
    public let value: Double?
    public let rawValue: Double?
    public let status: String?
    public let confidence: Double?
    /// A missing key means the server did not expose that dimension. A key
    /// with nil means the dimension was exposed but not calculable; a key with
    /// 0 remains an explicit zero.
    public let dimensionScores: [String: Double?]
    public let dimensionAdjustedScores: [String: Double?]

    public init(
        date: String,
        value: Double?,
        rawValue: Double?,
        status: String?,
        confidence: Double?,
        dimensionScores: [String: Double?] = [:],
        dimensionAdjustedScores: [String: Double?] = [:]
    ) {
        self.date = date
        self.value = value
        self.rawValue = rawValue
        self.status = status
        self.confidence = confidence
        self.dimensionScores = dimensionScores
        self.dimensionAdjustedScores = dimensionAdjustedScores
    }
}

public struct NutritionDailyAggregate: Codable, Equatable, Sendable {
    public let date: String
    public let mealCount: Int
    public let mealCoverage: Double
    public let homemadeCount: Int
    public let preparedCount: Int
    public let mixedCount: Int
    public let homemadeShare: Double
    public let caloriesKcal: Double?
    public let proteinG: Double?
    public let carbsG: Double?
    public let fatG: Double?
    public let fiberG: Double?
    public let sugarG: Double?
    public let addedSugarG: Double?
    public let analysisCoverage: Double?
    public let analysisConfidence: Double?
    public let foodVarietyCount: Int?
    public let foodGroupCount: Int?
    public let foodListCoverage: Double?
    public let foodGroupCounts: [String: Int]?
    public let foodObservationCoverage: [String: Double]?
    public let mouthHeatAverage: Double?
    public let mouthHeatMaximum: Double?
    public let stomachOverfullnessAverage: Double?
    public let stomachOverfullnessMaximum: Double?

    public init(
        date: String,
        mealCount: Int,
        mealCoverage: Double,
        homemadeCount: Int,
        preparedCount: Int,
        mixedCount: Int,
        homemadeShare: Double,
        caloriesKcal: Double?,
        proteinG: Double?,
        carbsG: Double?,
        fatG: Double?,
        fiberG: Double?,
        sugarG: Double?,
        addedSugarG: Double?,
        analysisCoverage: Double?,
        analysisConfidence: Double?,
        foodVarietyCount: Int?,
        foodGroupCount: Int?,
        foodListCoverage: Double?,
        foodGroupCounts: [String: Int]?,
        foodObservationCoverage: [String: Double]?,
        mouthHeatAverage: Double?,
        mouthHeatMaximum: Double?,
        stomachOverfullnessAverage: Double?,
        stomachOverfullnessMaximum: Double?
    ) {
        self.date = date
        self.mealCount = mealCount
        self.mealCoverage = mealCoverage
        self.homemadeCount = homemadeCount
        self.preparedCount = preparedCount
        self.mixedCount = mixedCount
        self.homemadeShare = homemadeShare
        self.caloriesKcal = caloriesKcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.fiberG = fiberG
        self.sugarG = sugarG
        self.addedSugarG = addedSugarG
        self.analysisCoverage = analysisCoverage
        self.analysisConfidence = analysisConfidence
        self.foodVarietyCount = foodVarietyCount
        self.foodGroupCount = foodGroupCount
        self.foodListCoverage = foodListCoverage
        self.foodGroupCounts = foodGroupCounts
        self.foodObservationCoverage = foodObservationCoverage
        self.mouthHeatAverage = mouthHeatAverage
        self.mouthHeatMaximum = mouthHeatMaximum
        self.stomachOverfullnessAverage = stomachOverfullnessAverage
        self.stomachOverfullnessMaximum = stomachOverfullnessMaximum
    }
}

public struct NutritionTrendMetric: Codable, Equatable, Sendable {
    public let id: String
    public let points: [NutritionTrendPoint]

    public init(id: String, points: [NutritionTrendPoint]) {
        self.id = id
        self.points = points
    }
}

public struct NutritionTrendPoint: Codable, Equatable, Sendable {
    public let date: String
    public let value: Double?

    public init(date: String, value: Double?) {
        self.date = date
        self.value = value
    }
}

public struct NutritionFoodGroupPoint: Codable, Equatable, Sendable {
    public let date: String
    public let counts: [String: Int]?

    public init(date: String, counts: [String: Int]?) {
        self.date = date
        self.counts = counts
    }
}

public struct NutritionTargetRange: Codable, Equatable, Sendable {
    public let low: Double
    public let likely: Double
    public let high: Double

    public init(low: Double, likely: Double, high: Double) {
        self.low = low
        self.likely = likely
        self.high = high
    }
}

public struct NutritionTargets: Codable, Equatable, Sendable {
    public let caloriesKcal: NutritionTargetRange
    public let proteinG: NutritionTargetRange
    public let fatG: NutritionTargetRange
    public let carbsG: NutritionTargetRange
    public let fiberG: NutritionTargetRange
    public let addedSugarG: NutritionTargetRange
    public let surplusKcal: Double
    public let mealDistribution: [String: Double]?

    public init(
        caloriesKcal: NutritionTargetRange,
        proteinG: NutritionTargetRange,
        fatG: NutritionTargetRange,
        carbsG: NutritionTargetRange,
        fiberG: NutritionTargetRange,
        addedSugarG: NutritionTargetRange,
        surplusKcal: Double,
        mealDistribution: [String: Double]?
    ) {
        self.caloriesKcal = caloriesKcal
        self.proteinG = proteinG
        self.fatG = fatG
        self.carbsG = carbsG
        self.fiberG = fiberG
        self.addedSugarG = addedSugarG
        self.surplusKcal = surplusKcal
        self.mealDistribution = mealDistribution
    }
}

public struct NutritionTargetState: Codable, Equatable, Sendable {
    public let base: NutritionTargets
    public let effective: NutritionTargets
    public let persisted: Bool
    public let effortScore: Double?
    public let effortCoverage: Double?
    public let averageEffortScore: Double?
    public let effortThreshold: Double
    public let effortSupplementKcal: Double
    public let effortAdjustmentApplied: Bool

    public init(
        base: NutritionTargets,
        effective: NutritionTargets,
        persisted: Bool,
        effortScore: Double?,
        effortCoverage: Double?,
        averageEffortScore: Double?,
        effortThreshold: Double,
        effortSupplementKcal: Double,
        effortAdjustmentApplied: Bool
    ) {
        self.base = base
        self.effective = effective
        self.persisted = persisted
        self.effortScore = effortScore
        self.effortCoverage = effortCoverage
        self.averageEffortScore = averageEffortScore
        self.effortThreshold = effortThreshold
        self.effortSupplementKcal = effortSupplementKcal
        self.effortAdjustmentApplied = effortAdjustmentApplied
    }
}

public struct NutritionSupplements: Codable, Equatable, Sendable {
    public let definitions: [NutritionSupplementDefinition]
    public let entries: [NutritionSupplementEntry]

    public static let empty = NutritionSupplements(definitions: [], entries: [])

    public init(definitions: [NutritionSupplementDefinition], entries: [NutritionSupplementEntry]) {
        self.definitions = definitions
        self.entries = entries
    }
}

public struct NutritionSupplementDefinition: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let productName: String
    public let brand: String?
    public let category: String
    public let source: String
    public let sourceReference: String?
    public let serving: NutritionSupplementServing
    public let nutrients: [NutritionSupplementNutrient]
    public let frequency: JSONValue
    public let usageInstruction: String?
    public let notes: String?
    public let isActive: Bool
    public let createdAt: String
    public let updatedAt: String
    public let archivedAt: String?
    public let contributionScope: String

    public init(
        id: String,
        productName: String,
        brand: String?,
        category: String,
        source: String,
        sourceReference: String?,
        serving: NutritionSupplementServing,
        nutrients: [NutritionSupplementNutrient],
        frequency: JSONValue,
        usageInstruction: String?,
        notes: String?,
        isActive: Bool,
        createdAt: String,
        updatedAt: String,
        archivedAt: String?,
        contributionScope: String
    ) {
        self.id = id
        self.productName = productName
        self.brand = brand
        self.category = category
        self.source = source
        self.sourceReference = sourceReference
        self.serving = serving
        self.nutrients = nutrients
        self.frequency = frequency
        self.usageInstruction = usageInstruction
        self.notes = notes
        self.isActive = isActive
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.archivedAt = archivedAt
        self.contributionScope = contributionScope
    }
}

public struct NutritionSupplementServing: Codable, Equatable, Sendable {
    public let quantity: Double
    public let unit: String
    public let label: String

    public init(quantity: Double, unit: String, label: String) {
        self.quantity = quantity
        self.unit = unit
        self.label = label
    }
}

public struct NutritionSupplementNutrient: Codable, Equatable, Sendable {
    public let key: String
    public let label: String
    public let amount: Double
    public let unit: String

    public init(key: String, label: String, amount: Double, unit: String) {
        self.key = key
        self.label = label
        self.amount = amount
        self.unit = unit
    }
}

public struct NutritionSupplementEntry: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let definitionId: String
    public let entryDate: String
    public let planned: NutritionSupplementDose
    public let actual: NutritionSupplementActualDose
    public let note: String?
    public let createdAt: String
    public let updatedAt: String

    public init(
        id: String,
        definitionId: String,
        entryDate: String,
        planned: NutritionSupplementDose,
        actual: NutritionSupplementActualDose,
        note: String?,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.definitionId = definitionId
        self.entryDate = entryDate
        self.planned = planned
        self.actual = actual
        self.note = note
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct NutritionSupplementDose: Codable, Equatable, Sendable {
    public let servings: Double
    public let scheduledAt: String?

    public init(servings: Double, scheduledAt: String?) {
        self.servings = servings
        self.scheduledAt = scheduledAt
    }
}

public struct NutritionSupplementActualDose: Codable, Equatable, Sendable {
    public let status: String
    public let servings: Double?
    public let takenAt: String?
    public let note: String?

    public init(status: String, servings: Double?, takenAt: String?, note: String?) {
        self.status = status
        self.servings = servings
        self.takenAt = takenAt
        self.note = note
    }
}

/// Native write payload for one supplement intake on one civil date. The
/// server owns validation, daily upsert identity, and status normalization.
public struct NutritionSupplementEntryRequest: Codable, Equatable, Sendable {
    public let definitionId: String
    public let entryDate: String
    public let planned: NutritionSupplementDose?
    public let actual: NutritionSupplementActualDose?
    public let status: String?
    public let note: String?

    public init(
        definitionId: String,
        entryDate: String,
        planned: NutritionSupplementDose? = nil,
        actual: NutritionSupplementActualDose? = nil,
        status: String? = nil,
        note: String? = nil
    ) {
        self.definitionId = definitionId
        self.entryDate = entryDate
        self.planned = planned
        self.actual = actual
        self.status = status
        self.note = note
    }
}

public struct NutritionSupplementEntryUpdateRequest: Codable, Equatable, Sendable {
    public let definitionId: String?
    public let entryDate: String?
    public let planned: NutritionSupplementDose?
    public let actual: NutritionSupplementActualDose?
    public let status: String?
    public let note: String?

    public init(
        definitionId: String? = nil,
        entryDate: String? = nil,
        planned: NutritionSupplementDose? = nil,
        actual: NutritionSupplementActualDose? = nil,
        status: String? = nil,
        note: String? = nil
    ) {
        self.definitionId = definitionId
        self.entryDate = entryDate
        self.planned = planned
        self.actual = actual
        self.status = status
        self.note = note
    }
}

public struct NutritionSupplementFrequencyRequest: Codable, Equatable, Sendable {
    public let kind: String
    public let timesPerDay: Int?
    public let timesPerWeek: Int?
    public let daysOfWeek: [Int]?
    public let instructions: String?

    public init(
        kind: String,
        timesPerDay: Int? = nil,
        timesPerWeek: Int? = nil,
        daysOfWeek: [Int]? = nil,
        instructions: String? = nil
    ) {
        self.kind = kind
        self.timesPerDay = timesPerDay
        self.timesPerWeek = timesPerWeek
        self.daysOfWeek = daysOfWeek
        self.instructions = instructions
    }
}

public struct NutritionSupplementDefinitionCreateRequest: Codable, Equatable, Sendable {
    public let productName: String
    public let brand: String?
    public let category: String
    public let source: String
    public let sourceReference: String?
    public let serving: NutritionSupplementServing
    public let nutrients: [NutritionSupplementNutrient]
    public let frequency: NutritionSupplementFrequencyRequest
    public let usageInstruction: String?
    public let notes: String?

    public init(
        productName: String,
        brand: String? = nil,
        category: String,
        source: String,
        sourceReference: String? = nil,
        serving: NutritionSupplementServing,
        nutrients: [NutritionSupplementNutrient] = [],
        frequency: NutritionSupplementFrequencyRequest,
        usageInstruction: String? = nil,
        notes: String? = nil
    ) {
        self.productName = productName
        self.brand = brand
        self.category = category
        self.source = source
        self.sourceReference = sourceReference
        self.serving = serving
        self.nutrients = nutrients
        self.frequency = frequency
        self.usageInstruction = usageInstruction
        self.notes = notes
    }
}

public struct NutritionSupplementDefinitionUpdateRequest: Codable, Equatable, Sendable {
    public let productName: String?
    public let brand: String?
    public let category: String?
    public let source: String?
    public let sourceReference: String?
    public let serving: NutritionSupplementServing?
    public let nutrients: [NutritionSupplementNutrient]?
    public let frequency: NutritionSupplementFrequencyRequest?
    public let usageInstruction: String?
    public let notes: String?
    public let archivedAt: String?

    public init(
        productName: String? = nil,
        brand: String? = nil,
        category: String? = nil,
        source: String? = nil,
        sourceReference: String? = nil,
        serving: NutritionSupplementServing? = nil,
        nutrients: [NutritionSupplementNutrient]? = nil,
        frequency: NutritionSupplementFrequencyRequest? = nil,
        usageInstruction: String? = nil,
        notes: String? = nil,
        archivedAt: String? = nil
    ) {
        self.productName = productName
        self.brand = brand
        self.category = category
        self.source = source
        self.sourceReference = sourceReference
        self.serving = serving
        self.nutrients = nutrients
        self.frequency = frequency
        self.usageInstruction = usageInstruction
        self.notes = notes
        self.archivedAt = archivedAt
    }
}

public struct NutritionRecipe: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let dishType: String?
    public let description: String?
    public let ingredients: [NutritionRecipeIngredient]
    public let aliases: [String]
    public let commonVariations: [String]
    public let isActive: Bool
    public let createdAt: String
    public let updatedAt: String

    public init(
        id: String,
        name: String,
        dishType: String?,
        description: String?,
        ingredients: [NutritionRecipeIngredient],
        aliases: [String],
        commonVariations: [String],
        isActive: Bool,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.name = name
        self.dishType = dishType
        self.description = description
        self.ingredients = ingredients
        self.aliases = aliases
        self.commonVariations = commonVariations
        self.isActive = isActive
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct NutritionRecipeIngredient: Codable, Equatable, Sendable {
    public let name: String
    public let varietyKey: String?
    public let usualAmount: String?
    public let preparation: String?
    public let alternatives: [String]

    public init(name: String, varietyKey: String?, usualAmount: String?, preparation: String?, alternatives: [String]) {
        self.name = name
        self.varietyKey = varietyKey
        self.usualAmount = usualAmount
        self.preparation = preparation
        self.alternatives = alternatives
    }
}

public struct NutritionRecipeIngredientRequest: Codable, Equatable, Sendable {
    public let name: String
    public let varietyKey: String?
    public let usualAmount: String?
    public let preparation: String?
    public let alternatives: [String]

    public init(
        name: String,
        varietyKey: String? = nil,
        usualAmount: String? = nil,
        preparation: String? = nil,
        alternatives: [String] = []
    ) {
        self.name = name
        self.varietyKey = varietyKey
        self.usualAmount = usualAmount
        self.preparation = preparation
        self.alternatives = alternatives
    }
}

public struct NutritionRecipeCreateRequest: Codable, Equatable, Sendable {
    public let name: String
    public let dishType: String?
    public let description: String?
    public let ingredients: [NutritionRecipeIngredientRequest]
    public let aliases: [String]
    public let commonVariations: [String]

    public init(
        name: String,
        dishType: String? = nil,
        description: String? = nil,
        ingredients: [NutritionRecipeIngredientRequest] = [],
        aliases: [String] = [],
        commonVariations: [String] = []
    ) {
        self.name = name
        self.dishType = dishType
        self.description = description
        self.ingredients = ingredients
        self.aliases = aliases
        self.commonVariations = commonVariations
    }
}

public struct NutritionRecipeUpdateRequest: Codable, Equatable, Sendable {
    public let name: String?
    public let dishType: String?
    public let description: String?
    public let ingredients: [NutritionRecipeIngredientRequest]?
    public let aliases: [String]?
    public let commonVariations: [String]?

    public init(
        name: String? = nil,
        dishType: String? = nil,
        description: String? = nil,
        ingredients: [NutritionRecipeIngredientRequest]? = nil,
        aliases: [String]? = nil,
        commonVariations: [String]? = nil
    ) {
        self.name = name
        self.dishType = dishType
        self.description = description
        self.ingredients = ingredients
        self.aliases = aliases
        self.commonVariations = commonVariations
    }
}

public struct NutritionSupplementEntryMutationResponse: Codable, Equatable, Sendable {
    public let entry: NutritionSupplementEntry

    public init(entry: NutritionSupplementEntry) {
        self.entry = entry
    }
}

public struct NutritionSupplementDefinitionMutationResponse: Codable, Equatable, Sendable {
    public let definition: NutritionSupplementDefinition

    public init(definition: NutritionSupplementDefinition) {
        self.definition = definition
    }
}

public struct NutritionRecipeMutationResponse: Codable, Equatable, Sendable {
    public let recipe: NutritionRecipe

    public init(recipe: NutritionRecipe) {
        self.recipe = recipe
    }
}

public struct NutritionProvenance: Codable, Equatable, Sendable {
    public let source: String
    public let calculation: String
    public let from: String
    public let to: String
    public let confirmedMealCount: Int
    public let measuredDays: Int
    public let note: String

    public init(source: String, calculation: String, from: String, to: String, confirmedMealCount: Int, measuredDays: Int, note: String) {
        self.source = source
        self.calculation = calculation
        self.from = from
        self.to = to
        self.confirmedMealCount = confirmedMealCount
        self.measuredDays = measuredDays
        self.note = note
    }
}

public struct NutritionSectionError: Codable, Equatable, Sendable, Identifiable {
    public let section: String
    public let message: String

    public var id: String { section }

    public init(section: String, message: String) {
        self.section = section
        self.message = message
    }
}
