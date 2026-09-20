import Foundation
import SomaCore

/// Données statiques fictives pour la QA visuelle de l'écran Repas.
/// Rien ici ne provient du serveur et aucun score n'est recalculé localement.
@MainActor
enum PreviewNutrition {
    static func response(for date: LocalDate, days: Int) -> NativeNutritionResponse {
        let count = max(7, min(days, 30))
        let dates = (0..<count).map { offset in
            (try? date.adding(days: offset - count + 1))?.rawValue ?? date.rawValue
        }
        let period = NutritionPeriod(from: dates.first ?? date.rawValue, to: date.rawValue, days: count)

        let scoreTrend = dates.enumerated().map { index, value in
            NutritionScoreTrendPoint(
                date: value,
                value: scoreValues[index % scoreValues.count],
                rawValue: rawScoreValues[index % rawScoreValues.count],
                status: scoreStatuses[index % scoreStatuses.count],
                confidence: scoreConfidences[index % scoreConfidences.count],
                dimensionScores: [
                    "meal_balance": scoreValues[index % scoreValues.count],
                    "added_sugar": addedSugarScores[index % addedSugarScores.count],
                    "food_variety": varietyScores[index % varietyScores.count]
                ],
                dimensionAdjustedScores: [
                    "meal_balance": scoreValues[index % scoreValues.count],
                    "added_sugar": adjustedSugarScores[index % adjustedSugarScores.count],
                    "food_variety": adjustedVarietyScores[index % adjustedVarietyScores.count]
                ]
            )
        }

        let score = NutritionScore(
            algorithmVersion: "preview-fictional-v0",
            value: 76,
            rawValue: 74,
            status: "ready",
            confidence: 0.86,
            observedDimensions: 4,
            components: [
                NutritionScoreComponent(
                    key: "meal_balance", label: "Équilibre des repas", score: 78, rawScore: 76, adjustedScore: 78,
                    weight: 0.35, contribution: 27.3, rawContribution: 26.6, severityPenalty: 0,
                    observationCoverage: 0.9, confidence: 0.88, status: "ready", observedValue: .number(0.82),
                    target: "Repas répartis sur la journée", summary: "Trois repas fictifs observés.",
                    period: NutritionScorePeriod(from: period.from, to: period.to), subcomponents: []
                ),
                NutritionScoreComponent(
                    key: "protein", label: "Protéines", score: 72, rawScore: 70, adjustedScore: 72,
                    weight: 0.25, contribution: 18, rawContribution: 17.5, severityPenalty: 0,
                    observationCoverage: 0.84, confidence: 0.8, status: "ready", observedValue: .number(112),
                    target: "90–130 g", summary: "Apport fictif dans la plage de repère.",
                    period: NutritionScorePeriod(from: period.from, to: period.to), subcomponents: []
                ),
                NutritionScoreComponent(
                    key: "added_sugar", label: "Sucres ajoutés", score: 81, rawScore: 81, adjustedScore: 81,
                    weight: 0.2, contribution: 16.2, rawContribution: 16.2, severityPenalty: 0,
                    observationCoverage: 0.72, confidence: 0.7, status: "partial", observedValue: .number(6),
                    target: "0–25 g", summary: "Une journée reste sans cette mesure.",
                    period: NutritionScorePeriod(from: period.from, to: period.to), subcomponents: []
                ),
                NutritionScoreComponent(
                    key: "food_variety", label: "Variété alimentaire", score: 69, rawScore: 69, adjustedScore: 69,
                    weight: 0.2, contribution: 13.8, rawContribution: 13.8, severityPenalty: 0,
                    observationCoverage: 0.78, confidence: 0.76, status: "ready", observedValue: .number(8),
                    target: "Au moins 6 familles", summary: "Plusieurs familles fictives sont représentées.",
                    period: NutritionScorePeriod(from: period.from, to: period.to), subcomponents: []
                )
            ],
            strongestEffects: [
                NutritionScoreEffect(key: "vegetable_presence", label: "Présence de légumes", direction: "positive", points: 8, summary: "Signal fictif de présentation."),
                NutritionScoreEffect(key: "coverage_gap", label: "Mesure absente", direction: "negative", points: -4, summary: "Une journée est volontairement sans estimation.")
            ],
            reasons: ["Fixture locale avec trois repas fictifs", "Une journée sans score pour tester l'état indisponible"]
        )

        let targets = NutritionTargets(
            caloriesKcal: NutritionTargetRange(low: 1_700, likely: 2_000, high: 2_300),
            proteinG: NutritionTargetRange(low: 90, likely: 110, high: 135),
            fatG: NutritionTargetRange(low: 50, likely: 70, high: 90),
            carbsG: NutritionTargetRange(low: 180, likely: 240, high: 310),
            fiberG: NutritionTargetRange(low: 25, likely: 32, high: 45),
            addedSugarG: NutritionTargetRange(low: 0, likely: 18, high: 30),
            surplusKcal: 0,
            mealDistribution: ["breakfast": 0.25, "lunch": 0.4, "dinner": 0.35]
        )
        let targetState = NutritionTargetState(
            base: targets, effective: targets, persisted: false, effortScore: nil, effortCoverage: nil,
            averageEffortScore: nil, effortThreshold: 70, effortSupplementKcal: 0, effortAdjustmentApplied: false
        )

        let daily = NutritionDailyAggregate(
            date: date.rawValue, mealCount: 3, mealCoverage: 0.92, homemadeCount: 2, preparedCount: 0,
            mixedCount: 1, homemadeShare: 0.67, caloriesKcal: 1_840, proteinG: 112, carbsG: 216,
            fatG: 64, fiberG: 31, sugarG: nil, addedSugarG: 6, analysisCoverage: 0.86,
            analysisConfidence: 0.8, foodVarietyCount: 8, foodGroupCount: 7, foodListCoverage: 0.82,
            foodGroupCounts: ["vegetable": 4, "fruit": 2, "whole_grain": 2, "legume": 1, "dairy": 1, "animal_protein": 2],
            foodObservationCoverage: ["vegetable": 0.9, "fruit": 0.75, "legume": 0.6],
            mouthHeatAverage: 1.2, mouthHeatMaximum: 2, stomachOverfullnessAverage: 1.1, stomachOverfullnessMaximum: 2
        )

        let supplementID = "preview-supplement-magnesium"
        let supplement = NutritionSupplementDefinition(
            id: supplementID, productName: "Magnésium du soir", brand: "Fixture Atelier", category: "mineral",
            source: "Fixture locale", sourceReference: "preview-only",
            serving: NutritionSupplementServing(quantity: 1, unit: "capsule", label: "1 capsule"),
            nutrients: [NutritionSupplementNutrient(key: "magnesium", label: "Magnésium", amount: 150, unit: "mg")],
            frequency: .object(["kind": .string("daily"), "instructions": .string("Donnée fictive")]),
            usageInstruction: "Après le repas · exemple fictif", notes: "QA visuelle uniquement", isActive: true,
            createdAt: "2026-09-01T08:00:00Z", updatedAt: "2026-09-01T08:00:00Z", archivedAt: nil, contributionScope: "none"
        )
        let entry = NutritionSupplementEntry(
            id: "preview-supplement-entry", definitionId: supplementID, entryDate: date.rawValue,
            planned: NutritionSupplementDose(servings: 1, scheduledAt: "21:00"),
            actual: NutritionSupplementActualDose(status: "taken", servings: 1, takenAt: "21:10", note: "Fixture QA"),
            note: "Valeur fictive", createdAt: "2026-09-20T20:10:00Z", updatedAt: "2026-09-20T20:10:00Z"
        )
        let recipe = NutritionRecipe(
            id: "preview-recipe-bowl", name: "Bowl lentilles citron", dishType: "lunch",
            description: "Repère personnel fictif pour une assiette complète.",
            ingredients: [
                NutritionRecipeIngredient(name: "Lentilles", varietyKey: "green", usualAmount: "160 g cuites", preparation: "Rincées", alternatives: ["Pois chiches"]),
                NutritionRecipeIngredient(name: "Carottes", varietyKey: nil, usualAmount: "2 petites", preparation: "Rôties", alternatives: ["Courgette"]),
                NutritionRecipeIngredient(name: "Yaourt nature", varietyKey: nil, usualAmount: "1 cuillère", preparation: "En sauce", alternatives: ["Tahini"])
            ], aliases: ["Bowl vert"], commonVariations: ["Avec riz complet"], isActive: true,
            createdAt: "2026-09-02T08:00:00Z", updatedAt: "2026-09-02T08:00:00Z"
        )

        return NativeNutritionResponse(
            date: date.rawValue, timezone: "Europe/Zurich", period: period, score: score,
            rolling: [
                NutritionRollingScore(days: 7, score: 68, observedDays: 6, readyDays: 5, totalDays: 7),
                NutritionRollingScore(days: 30, score: 71, observedDays: 24, readyDays: 21, totalDays: 30)
            ],
            scoreTrend: scoreTrend, daily: daily,
            nutritionHistory: [
                metric(id: "caloriesKcal", dates: dates, values: [1_720, 1_950, 1_880, nil, 2_040, 1_760, 1_840, 1_910, 1_990, 1_840]),
                metric(id: "proteinG", dates: dates, values: [94, 108, 0, 101, nil, 98, 112, 116, 109, 112]),
                metric(id: "carbsG", dates: dates, values: [198, 224, 210, 0, 245, nil, 216, 232, 258, 216]),
                metric(id: "fatG", dates: dates, values: [58, 66, 62, nil, 71, 55, 64, 68, 73, 64]),
                metric(id: "addedSugarG", dates: dates, values: [12, 8, nil, 0, 18, 9, 6, 14, 4, 6])
            ],
            foodGroupHistory: dates.enumerated().map { index, pointDate in
                NutritionFoodGroupPoint(date: pointDate, counts: foodGroups[index % foodGroups.count])
            },
            targets: targetState,
            supplements: NutritionSupplements(definitions: [supplement], entries: [entry]), recipes: [recipe],
            provenance: NutritionProvenance(
                source: "Fixture locale fictive", calculation: "Données statiques de QA visuelle",
                from: period.from, to: period.to, confirmedMealCount: 3, measuredDays: max(count - 1, 0),
                note: "Fixture fictive pour QA visuelle native. Aucune valeur ne provient du serveur réel."
            )
        )
    }

    private static func metric(id: String, dates: [String], values: [Double?]) -> NutritionTrendMetric {
        NutritionTrendMetric(id: id, points: dates.enumerated().map { index, date in
            NutritionTrendPoint(date: date, value: values[index % values.count])
        })
    }

    private static let scoreValues: [Double?] = [58, 62, 65, nil, 71, 68, 74, 76, 79, 72]
    private static let rawScoreValues: [Double?] = [56, 60, 64, nil, 69, 67, 72, 75, 77, 71]
    private static let scoreStatuses: [String?] = ["ready", "ready", "ready", "insufficient", "ready", "partial", "ready", "ready", "ready", "ready"]
    private static let scoreConfidences: [Double?] = [0.63, 0.7, 0.74, nil, 0.81, 0.67, 0.84, 0.86, 0.9, 0.78]
    private static let addedSugarScores: [Double?] = [64, 70, nil, nil, 78, 74, 82, 81, 85, 76]
    private static let varietyScores: [Double?] = [52, 61, 0, nil, 66, 70, 73, 69, 78, 64]
    private static let adjustedSugarScores: [Double?] = [66, 71, nil, nil, 79, 75, 83, 82, 86, 77]
    private static let adjustedVarietyScores: [Double?] = [54, 62, 0, nil, 67, 71, 74, 70, 79, 65]
    private static let foodGroups: [[String: Int]?] = [
        ["vegetable": 3, "fruit": 1, "whole_grain": 2, "animal_protein": 1],
        ["vegetable": 2, "legume": 1, "dairy": 1, "nuts_seeds": 1], nil,
        ["vegetable": 2, "fruit": 0, "whole_grain": 1, "animal_protein": 2],
        ["vegetable": 4, "fruit": 1, "legume": 1, "dairy": 1],
        ["vegetable": 1, "fruit": 2, "whole_grain": 2, "plant_protein": 1],
        ["vegetable": 4, "fruit": 2, "whole_grain": 2, "legume": 1, "animal_protein": 2]
    ]
}
