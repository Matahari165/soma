import { MEAL_ACTIVE_QUALITY_PROPERTIES } from "@/domain/meal-taxonomy";

/**
 * Wire contract sent to the provider. Cross-field observation rules are
 * enforced by the normalizer and the canonical domain validator afterwards.
 */
export function mealAnalysisJsonSchema() {
  const range = {
    anyOf: [
      { type: "null" },
      {
        type: "object",
        additionalProperties: false,
        required: ["low", "likely", "high"],
        properties: {
          low: { type: "number", minimum: 0 },
          likely: { type: "number", minimum: 0 },
          high: { type: "number", minimum: 0 },
        },
      },
    ],
  };
  const food = {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "preparation", "portion", "estimatedGrams", "kind", "parentId", "course", "countedInTotals", "foodGroups", "varietyKey", "alcoholic", "novaGroup", "sugarExposure", "observation", "qualityProperties", "evidence", "evidenceSource", "evidencePhotoIds", "quantity", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "addedSugarGrams", "confidence"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 120 },
      name: { type: "string", maxLength: 120 },
      preparation: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] },
      portion: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
      estimatedGrams: { anyOf: [{ type: "number", minimum: 0, maximum: 10000 }, { type: "null" }] },
      kind: { type: "string", enum: ["dish", "component", "ingredient"] },
      parentId: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
      course: { anyOf: [{ type: "string", enum: ["starter", "main", "side", "dessert"] }, { type: "null" }] },
      countedInTotals: { type: "boolean" },
      foodGroups: { type: "array", maxItems: 4, items: { type: "string", enum: ["fruit", "vegetable", "legume", "whole_grain", "refined_grain", "potato", "animal_protein", "plant_protein", "egg", "dairy", "nuts_seeds", "added_fat", "sauce", "sweet", "beverage", "other"] } },
      varietyKey: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] },
      alcoholic: { type: "boolean" },
      novaGroup: { anyOf: [{ type: "integer", minimum: 1, maximum: 4 }, { type: "null" }] },
      sugarExposure: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["concentrated", "liquid"],
            properties: {
              concentrated: { anyOf: [{ type: "boolean" }, { type: "null" }] },
              liquid: { anyOf: [{ type: "boolean" }, { type: "null" }] },
            },
          },
        ],
      },
      observation: {
        type: "object",
        additionalProperties: false,
        required: ["portion", "novaGroup", "sugarExposure", "qualityProperties", "confidence"],
        properties: {
          portion: { type: "string", enum: ["observed", "unknown"] },
          novaGroup: { type: "string", enum: ["observed", "unknown"] },
          sugarExposure: { type: "string", enum: ["observed", "none_observed", "unknown"] },
          qualityProperties: { type: "string", enum: ["observed", "none_observed", "unknown"] },
          confidence: {
            type: "object",
            additionalProperties: false,
            required: ["portion", "novaGroup", "sugarExposure", "qualityProperties"],
            properties: {
              portion: { type: "string", enum: ["low", "medium", "high"] },
              novaGroup: { type: "string", enum: ["low", "medium", "high"] },
              sugarExposure: { type: "string", enum: ["low", "medium", "high"] },
              qualityProperties: { type: "string", enum: ["low", "medium", "high"] },
            },
          },
        },
      },
      // `null` is the wire representation of an unknown quality axis. An empty
      // array means the axis was reviewed and no listed property was observed.
      qualityProperties: {
        anyOf: [
          { type: "null" },
          {
            type: "array",
            maxItems: MEAL_ACTIVE_QUALITY_PROPERTIES.length,
            items: { type: "string", enum: [...MEAL_ACTIVE_QUALITY_PROPERTIES] },
          },
        ],
      },
      evidence: { type: "string", enum: ["visible", "inferred", "unknown"] },
      evidenceSource: { type: "string", enum: ["photo", "note", "model"] },
      evidencePhotoIds: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 120 } },
      quantity: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["value", "unit", "basis", "grams"],
            properties: {
              value: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
              unit: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
              basis: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] },
              grams: { anyOf: [{ type: "number", minimum: 0, maximum: 10000 }, { type: "null" }] },
            },
          },
        ],
      },
      calories: range,
      proteinGrams: range,
      carbohydrateGrams: range,
      fatGrams: range,
      fiberGrams: range,
      sugarGrams: range,
      addedSugarGrams: range,
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "dishType", "calorieAnalysis", "foods", "totals", "confidence", "uncertainties", "uncertaintySignals"],
    properties: {
      summary: { type: "string", maxLength: 800 },
      dishType: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] },
      calorieAnalysis: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
      foods: { type: "array", maxItems: 30, items: food },
      totals: {
        type: "object",
        additionalProperties: false,
        required: ["calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "addedSugarGrams"],
        properties: {
          calories: range,
          proteinGrams: range,
          carbohydrateGrams: range,
          fatGrams: range,
          fiberGrams: range,
          sugarGrams: range,
          addedSugarGrams: range,
        },
      },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      uncertainties: { type: "array", maxItems: 12, items: { type: "string", maxLength: 300 } },
      uncertaintySignals: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "field", "foodId", "severity", "detail"],
          properties: {
            code: { type: "string", enum: ["food_identity_unknown", "portion_unknown", "brand_unknown", "recipe_unknown", "preparation_unknown", "sauce_or_oil_unknown", "nova_group_unknown", "sugar_exposure_unknown", "quality_properties_unknown", "composition_uncertain", "duplicate_risk", "nutrition_unknown"] },
            field: { type: "string", enum: ["identity", "portion", "brand", "recipe", "preparation", "sauceOrOil", "novaGroup", "sugarExposure", "qualityProperties", "nutrition", "composition", "source"] },
            foodId: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            detail: { type: "string", minLength: 1, maxLength: 240 },
          },
        },
      },
    },
  };
}
