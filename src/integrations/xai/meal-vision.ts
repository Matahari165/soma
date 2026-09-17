import "server-only";

import type { MealRecipeReference } from "@/domain/meal-recipes";
import {
  validateMealAnalysis,
  type MealAnalysis,
  type MealAnalysisCorrection,
  type MealOrigin,
  type MealType,
} from "@/domain/meals";
import {
  MEAL_ACTIVE_QUALITY_PROPERTIES,
  MEAL_IGNORED_QUALITY_PROPERTIES,
  MEAL_VARIETY_EXCLUDED_FOOD_GROUPS,
  MEAL_VARIETY_POSITIVE_FOOD_GROUPS,
} from "@/domain/meal-taxonomy";
import { requireServerEnv } from "@/lib/env";

export type MealVisionImage = {
  id: string;
  mimeType: string;
  origin: MealOrigin;
  data: ArrayBuffer;
};

export type MealVisionInput = {
  mealType: MealType;
  mealDate: string;
  note: string | null;
  images: MealVisionImage[];
  correction?: MealAnalysisCorrection | null;
  /** Previous structured result used only as a correction reference after photo purge. */
  previousAnalysis?: MealAnalysis | null;
  recipeReferences?: MealRecipeReference[];
  /** Correlation only; never included in the model prompt. */
  requestId?: string;
};

export type MealVisionTextInput = {
  mealType: MealType;
  mealDate: string;
  note: string;
  correction?: MealAnalysisCorrection | null;
  /** Previous structured result used only as a correction reference after photo purge. */
  previousAnalysis?: MealAnalysis | null;
  recipeReferences?: MealRecipeReference[];
  requestId?: string;
};

/**
 * Safe provider failure. The category is deliberately coarse so API responses
 * remain useful for diagnosis without exposing xAI responses, credentials, or
 * request payloads.
 */
export type MealVisionErrorCode =
  | "provider_auth"
  | "provider_rate_limited"
  | "provider_request"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_empty_response"
  | "response_parse_error"
  | "response_schema_error"
  | "invalid_response";

export class MealVisionError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: MealVisionErrorCode,
    message: string,
    options?: { cause?: unknown; provider?: string; status?: number; retryable?: boolean; retryAfterMs?: number; requestId?: string },
  ) {
    super(message, options);
    this.name = "MealVisionError";
    this.provider = options?.provider;
    this.status = options?.status;
    this.retryAfterMs = options?.retryAfterMs;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? (code === "provider_timeout" || code === "provider_rate_limited" || code === "provider_unavailable" || code === "provider_empty_response");
  }

  readonly provider?: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
}

export type MealVisionProvider = {
  name: string;
  model: string;
  verification?: { provider: string; model: string };
  analyze(input: MealVisionInput): Promise<MealAnalysis>;
  analyzeText?(input: MealVisionTextInput): Promise<MealAnalysis>;
  verify?(input: MealVisionVerificationInput): Promise<MealAnalysis>;
};

export type MealVisionVerificationInput = MealVisionInput & {
  primaryAnalysis: MealAnalysis;
};

/** xAI image understanding currently accepts JPEG/JPG and PNG input. */
export function isXaiVisionMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/png";
}

const MAX_PROVIDER_ATTEMPTS = 2;
const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000;
const MAX_PROVIDER_TIMEOUT_MS = 15_000;
const TEXT_PROVIDER_TIMEOUT_MS = 10_000;
const VALIDATOR_TIMEOUT_MS = 8_000;

function providerTimeoutMs(fallback: number, requested?: number) {
  const configured = requested ?? Number(process.env.MEAL_ANALYSIS_PROVIDER_TIMEOUT_MS || fallback);
  return Number.isFinite(configured)
    ? Math.min(MAX_PROVIDER_TIMEOUT_MS, Math.max(1_000, configured))
    : fallback;
}

/** Bump these identifiers whenever the provider contract changes. */
export const MEAL_ANALYSIS_PROMPT_VERSION = "meal-analysis-prompt-v2";
export const MEAL_ANALYSIS_SCHEMA_VERSION = "meal-analysis-schema-v2";

type VisionImageDetail = "low" | "high";

const MEAL_PHOTO_EVIDENCE_CONTRACT_PROMPT = "Traite chaque photo comme une preuve indépendante : plusieurs photos montrent généralement des éléments différents du même repas. Conserve ces aliments séparément. Ne fusionne que si tu reconnais clairement le même aliment ou la même portion sous des angles différents ; dans ce cas, garde un seul food et toutes les evidencePhotoIds correspondantes. Ne déduplique jamais seulement parce que deux noms se ressemblent. Chaque evidencePhotoIds doit appartenir exactement aux identifiants des photos fournies, et tout aliment attribué à une photo doit référencer au moins une de ces photos.";

const MEAL_VARIETY_CONTRACT_PROMPT = [
  `Pour la variété positive, utilise uniquement les familles foodGroups positives : ${MEAL_VARIETY_POSITIVE_FOOD_GROUPS.join(", ")}. Un aliment sans famille justifiée ne compte pas.`,
  `Les familles ${MEAL_VARIETY_EXCLUDED_FOOD_GROUPS.join(", ")} sont toujours exclues de la variété positive ; cela couvre notamment les bonbons, desserts sucrés, sodas, jus, boissons sucrées, sauces et aliments non classés. Ces éléments peuvent rester dans foods pour décrire le repas, les sucres ou l'exposition, mais ne doivent jamais recevoir un signal de variété positive. Une famille exclue est prioritaire si plusieurs familles sont présentes.`,
].join(" ");

const MEAL_QUALITY_CONTRACT_PROMPT = [
  `Pour qualityProperties, transmets uniquement les rôles actifs ${MEAL_ACTIVE_QUALITY_PROPERTIES.join(", ")}.`,
  `Le rôle plant est porté par les foodGroups positives et non par qualityProperties. Les propriétés historiques ${MEAL_IGNORED_QUALITY_PROPERTIES.join(", ")} peuvent encore apparaître dans d'anciennes analyses, mais elles ne sont jamais des signaux actifs et ne doivent pas être émises dans une nouvelle réponse.`,
].join(" ");

const MEAL_SUGAR_CONTRACT_PROMPT = "Pour chaque aliment et dans totals, transmets toujours sugarGrams pour les sucres totaux et addedSugarGrams pour les sucres ajoutés : utilise une fourchette quand elle est estimable et null quand elle ne l'est pas. Ne confonds jamais glucides et sucres. Une valeur explicitement nulle ou une fourchette dont les bornes valent zéro sont différentes : null signifie indisponible, zéro signifie une observation ou une estimation nulle soutenue. Respecte addedSugarGrams <= sugarGrams <= carbohydrateGrams quand les intervalles sont connus. Les anciennes réponses peuvent omettre ces champs ; elles sont normalisées à null uniquement à la lecture."

const MEAL_NOVA_CONTRACT_PROMPT = "Pour novaGroup, utilise uniquement 1, 2, 3 ou 4 lorsque le niveau de transformation est raisonnablement identifiable ; utilise null sinon et n'infère jamais NOVA depuis le seul caractère sain ou malsain.";

export const MEAL_PHOTO_PROVIDER_INSTRUCTIONS = `You are a careful food-photo analyst. Return stable food ids, per-axis observation statuses and per-axis confidence. Treat each supplied photo as independent evidence: several photos usually show different parts or elements of the same meal, so keep distinct foods distinct. Merge only when it is clear that two photos show the same food or portion from another angle; then keep one food item and list every supporting photo id in evidencePhotoIds. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Every evidencePhotoIds value must be one of the supplied photo ids, and a photo-supported food must reference at least one of them. Use ranges with low <= likely <= high, explicit nulls when not estimable, and structured uncertainty signals for important unknowns. Missing nutrition is never zero. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Labels in French. Return only the requested JSON object.`;

export const MEAL_TEXT_PROVIDER_INSTRUCTIONS = `You are a careful food-description analyst. List only foods named in the user description and return stable food ids with structured observation statuses. Never invent exact grams or nutrition precision the description cannot support; use wide ranges with low <= likely <= high and explicit nulls when not estimable. Missing nutrition is never zero. Default confidence to low unless the description is very precise. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Always include 'Estimation à partir de la seule description, sans photo.' in uncertainties and machine-readable uncertaintySignals for important unknowns. A text-only food must use an empty evidencePhotoIds array and must not claim photo evidence. Labels in French. Return only the requested JSON object.`;

export const MEAL_VALIDATOR_PROVIDER_INSTRUCTIONS = `Tu es un validateur attentif d'analyses de repas. Relis l'analyse primaire à partir des preuves disponibles, vérifie ids, quantités, plats composés, doublons, parentId, alcoholic/countInTotals, statuts observation, sauces/préparations, NOVA et nutrition, puis corrige uniquement si les preuves le justifient. Pour plusieurs photos, traite chaque photo comme une preuve indépendante d'un élément potentiellement différent ; ne fusionne que les doublons évidents ou les angles différents du même aliment. Ne fabrique jamais de quantité ou de précision. Vérifie que chaque evidencePhotoIds appartient aux photos source et qu'un aliment attribué à une photo conserve au moins une preuve. Respecte les fourchettes low <= likely <= high, la compatibilité des intervalles sans exiger leur addition exacte, les relations addedSugarGrams <= sugarGrams <= carbohydrateGrams quand elles sont connues, et les nulls quand une donnée ne peut pas être estimée. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Ne transforme pas unknown en none_observed et conserve uncertaintySignals structurés. Les libellés sont en français. Retourne uniquement l'objet JSON demandé.`;

export function imageDataUri(image: MealVisionImage) {
  return `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`;
}

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

function responseText(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const fragments: string[] = [];
  const addFragment = (value: unknown) => {
    if (typeof value === "string" && value.trim()) fragments.push(value);
  };
  const response = result as { output_text?: unknown; output?: unknown; choices?: unknown; output_parsed?: unknown };
  addFragment(response.output_text);

  const output = response.output;
  if (Array.isArray(output)) output.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const typedItem = item as { type?: unknown; text?: unknown; content?: unknown };
    if (typedItem.type !== "reasoning" && typedItem.type !== "summary") addFragment(typedItem.text);
    if (!Array.isArray(typedItem.content)) return;
    typedItem.content.forEach((part) => {
      if (!part || typeof part !== "object") return;
      const typedPart = part as { type?: unknown; text?: unknown; refusal?: unknown };
      if (typedPart.type === "refusal" || typedPart.type === "reasoning" || typedPart.type === "summary") return;
      // xAI documents `output_text`, while compatible Responses handlers may
      // expose the same final block as `text` or omit the type in mocks.
      addFragment(typedPart.text);
    });
  });

  // Keep compatibility with OpenAI-compatible Responses payloads. This is
  // intentionally limited to assistant message content, never arbitrary
  // nested strings from the provider response.
  if (Array.isArray(response.choices)) response.choices.forEach((choice) => {
    if (!choice || typeof choice !== "object") return;
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") return;
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") addFragment(content);
    if (Array.isArray(content)) content.forEach((part) => {
      if (part && typeof part === "object") addFragment((part as { text?: unknown }).text);
    });
  });

  if (!fragments.length && response.output_parsed && typeof response.output_parsed === "object") {
    addFragment(JSON.stringify(response.output_parsed));
  }
  return fragments.join("\n") || null;
}

function responseDiagnostics(result: unknown) {
  if (!result || typeof result !== "object") return {};
  const response = result as { id?: unknown; status?: unknown; incomplete_details?: unknown; usage?: unknown; output?: unknown };
  const incompleteDetails = response.incomplete_details && typeof response.incomplete_details === "object"
    ? response.incomplete_details as { reason?: unknown }
    : null;
  const usage = response.usage && typeof response.usage === "object"
    ? response.usage as { output_tokens?: unknown; output_tokens_details?: unknown }
    : null;
  const outputDetails = usage?.output_tokens_details && typeof usage.output_tokens_details === "object"
    ? usage.output_tokens_details as { reasoning_tokens?: unknown }
    : null;
  const outputTypes = Array.isArray(response.output)
    ? response.output.map((item) => item && typeof item === "object" ? (item as { type?: unknown }).type : null).filter((type): type is string => typeof type === "string").slice(0, 8)
    : undefined;
  return {
    responseId: typeof response.id === "string" ? response.id : undefined,
    responseStatus: typeof response.status === "string" ? response.status : undefined,
    incompleteReason: typeof incompleteDetails?.reason === "string" ? incompleteDetails.reason : undefined,
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined,
    reasoningTokens: typeof outputDetails?.reasoning_tokens === "number" ? outputDetails.reasoning_tokens : undefined,
    outputTypes,
  };
}

function balancedJsonCandidates(text: string) {
  const candidates: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return candidates;
}

function normalizeNumericFields(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return value;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : value;
}

function normalizeRange(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const range = value as Record<string, unknown>;
  return {
    ...range,
    low: normalizeNumericFields(range.low),
    likely: normalizeNumericFields(range.likely),
    high: normalizeNumericFields(range.high),
  };
}

function normalizeStructuredAnalysis(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const normalizeFood = (food: unknown) => {
    if (!food || typeof food !== "object" || Array.isArray(food)) return food;
    const item = food as Record<string, unknown>;
    const quantity = item.quantity && typeof item.quantity === "object" && !Array.isArray(item.quantity)
      ? { ...(item.quantity as Record<string, unknown>), value: normalizeNumericFields((item.quantity as Record<string, unknown>).value), grams: normalizeNumericFields((item.quantity as Record<string, unknown>).grams) }
      : item.quantity;
    const observation = item.observation && typeof item.observation === "object" && !Array.isArray(item.observation)
      ? { ...(item.observation as Record<string, unknown>) }
      : item.observation;
    if (observation && typeof observation === "object" && !Array.isArray(observation)) {
      const status = observation as Record<string, unknown>;
      const hasPortion = Boolean(
        (typeof item.portion === "string" && item.portion.trim())
        || item.estimatedGrams != null
        || (quantity && typeof quantity === "object" && !Array.isArray(quantity) && ((quantity as Record<string, unknown>).value != null || (quantity as Record<string, unknown>).grams != null)),
      );
      // Preserve an explicit provider status. Only infer a status for legacy
      // responses that did not carry the axis, otherwise normalization would
      // silently turn an intentional `unknown` into an observed value (or the
      // reverse) and weaken the scoring contract.
      if (status.portion !== "observed" && status.portion !== "unknown") {
        status.portion = hasPortion ? "observed" : "unknown";
      }
      if (status.novaGroup !== "observed" && status.novaGroup !== "unknown") {
        status.novaGroup = item.novaGroup == null ? "unknown" : "observed";
      }
      const sugar = item.sugarExposure && typeof item.sugarExposure === "object" && !Array.isArray(item.sugarExposure)
        ? item.sugarExposure as Record<string, unknown>
        : null;
      const sugarKnown = sugar?.concentrated !== null && sugar?.concentrated !== undefined && sugar?.liquid !== null && sugar?.liquid !== undefined;
      if (status.sugarExposure !== "observed" && status.sugarExposure !== "none_observed" && status.sugarExposure !== "unknown") {
        status.sugarExposure = !sugarKnown
          ? "unknown"
          : sugar?.concentrated === false && sugar?.liquid === false
            ? "none_observed"
            : "observed";
      }
      if (status.qualityProperties !== "observed" && status.qualityProperties !== "none_observed" && status.qualityProperties !== "unknown") {
        status.qualityProperties = !Array.isArray(item.qualityProperties)
          ? "unknown"
          : item.qualityProperties.length
            ? "observed"
            : "none_observed";
      }
    }
    const normalizedItem = { ...item };
    // Strict OpenAI schemas require every property to be present. `null` is
    // the wire representation of an unknown descriptive axis; the canonical
    // Zod model represents that same state by omitting qualityProperties.
    if (normalizedItem.qualityProperties === null) delete normalizedItem.qualityProperties;
    return {
      ...normalizedItem,
      estimatedGrams: normalizeNumericFields(item.estimatedGrams),
      calories: normalizeRange(item.calories),
      proteinGrams: normalizeRange(item.proteinGrams),
      carbohydrateGrams: normalizeRange(item.carbohydrateGrams),
      fatGrams: normalizeRange(item.fatGrams),
      fiberGrams: normalizeRange(item.fiberGrams),
      // Sugar fields were added after older analyses had already been stored.
      // Missing is therefore normalized to null, never to zero or an estimate.
      sugarGrams: item.sugarGrams === undefined ? null : normalizeRange(item.sugarGrams),
      addedSugarGrams: item.addedSugarGrams === undefined ? null : normalizeRange(item.addedSugarGrams),
      quantity,
      observation,
    };
  };
  const totals = source.totals && typeof source.totals === "object" && !Array.isArray(source.totals)
    ? Object.fromEntries(Object.entries(source.totals as Record<string, unknown>).map(([key, entry]) => [key, key.endsWith("Grams") || key === "calories" ? normalizeRange(entry) : entry]))
    : source.totals;
  if (totals && typeof totals === "object" && !Array.isArray(totals)) {
    const normalizedTotals = totals as Record<string, unknown>;
    // Keep old provider responses readable while making unavailability
    // explicit for downstream adapters.
    if (!Object.prototype.hasOwnProperty.call(normalizedTotals, "sugarGrams")) normalizedTotals.sugarGrams = null;
    if (!Object.prototype.hasOwnProperty.call(normalizedTotals, "addedSugarGrams")) normalizedTotals.addedSugarGrams = null;
  }
  return {
    ...source,
    foods: Array.isArray(source.foods) ? source.foods.map(normalizeFood) : source.foods,
    totals,
  };
}

function structuredJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [fenced, trimmed, ...balancedJsonCandidates(trimmed)].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return normalizeStructuredAnalysis(JSON.parse(candidate) as unknown);
    } catch (error) {
      lastError = error;
    }
  }
  throw new MealVisionError("response_parse_error", "La réponse du provider n’est pas un JSON valide.", { cause: lastError });
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(5_000, Math.max(0, seconds * 1_000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(5_000, Math.max(0, timestamp - Date.now())) : undefined;
}

function providerMessage(provider: "xai" | "openai", code: MealVisionErrorCode) {
  if (code === "provider_auth") return provider === "xai" ? "La configuration de l’analyse Grok est invalide." : "La configuration de l’analyse ChatGPT est invalide.";
  if (code === "provider_rate_limited") return provider === "xai" ? "Grok est momentanément sollicité. Réessaie dans quelques instants." : "ChatGPT est momentanément sollicité. Réessaie dans quelques instants.";
  if (code === "provider_timeout") return provider === "xai" ? "Grok n’a pas répondu à temps." : "ChatGPT n’a pas répondu à temps.";
  if (code === "provider_request") return provider === "xai" ? "La demande d’analyse Grok est invalide." : "La demande d’analyse ChatGPT est invalide.";
  if (code === "provider_empty_response") return provider === "xai" ? "Grok n’a pas retourné d’analyse structurée." : "ChatGPT n’a pas retourné d’analyse structurée.";
  return provider === "xai" ? "Grok est momentanément indisponible." : "ChatGPT est momentanément indisponible.";
}

function recipeReferencesPrompt(recipeReferences: MealRecipeReference[] | undefined) {
  if (!recipeReferences?.length) return "Aucune recette personnelle pertinente n'a été fournie.";
  return [
    "Références personnelles facultatives : elles décrivent des recettes récurrentes, mais leurs ingrédients et quantités sont variables et indicatifs.",
    "Utilise-les seulement comme hypothèses de contexte. La photo et la description actuelles priment. Ne copie jamais un ingrédient, une préparation ou une quantité qui n'est pas visible ou explicitement décrit aujourd'hui. Si une référence contredit les preuves actuelles, ignore-la et conserve une incertitude.",
    `Personal recipe references (context only): ${JSON.stringify(recipeReferences)}`,
  ].join("\n");
}

function previousAnalysisPrompt(previousAnalysis: MealAnalysis | null | undefined) {
  if (!previousAnalysis) return "Aucune analyse précédente n'a été fournie comme référence.";
  return [
    "Analyse précédente conservée (référence textuelle uniquement) : elle peut aider à comprendre une correction, mais elle ne constitue pas une nouvelle preuve et ses anciennes photos ne sont plus disponibles.",
    `Previous structured analysis (reference only): ${JSON.stringify(previousAnalysis)}`,
  ].join("\n");
}

export function makeTextPrompt(input: MealVisionTextInput) {
  return [
    "Analyse cette description libre d'un repas pour un journal alimentaire personnel. Réponds avec des libellés en français.",
    "Liste chaque aliment cité dans la description et attribue-lui un id local unique (par exemple food-1). Indique une quantité ou une portion seulement si l'utilisateur la donne explicitement (par exemple « 2 bananes ») ; sinon portion à null. Ne jamais inventer de grammes : estimatedGrams à null si la description ne permet pas une estimation responsable.",
    "Pour un plat composé, distingue le plat, ses composants et les ingrédients seulement si cela évite une ambiguïté. Le parent doit avoir kind=dish, chaque enfant un parentId qui référence son id, et countedInTotals=false pour le parent si ses composants sont comptés. Ne double jamais les totaux.",
    "Pour chaque aliment, renseigne course avec starter, main, side ou dessert seulement si la description indique clairement sa place dans le repas ; utilise null sinon. course sert uniquement à structurer l'affichage (entrée, plat, accompagnement, dessert), pas à juger l'aliment.",
    "Pour chaque aliment, renseigne foodGroups avec les grandes familles alimentaires justifiées par la description. Renseigne varietyKey avec un nom canonique court en français pour reconnaître le même aliment dans le temps (par exemple « tomate », « poulet », « riz »), ou null si l'identité est trop incertaine. Renseigne alcoholic=true uniquement pour une boisson ou un aliment alcoolisé : l'alcool est conservé pour trace mais exclu des dimensions du score et ne doit pas être inclus dans countedInTotals ni dans les totaux nutritionnels. Ces champs décrivent la composition ; ils ne constituent pas un jugement de qualité.",
    MEAL_VARIETY_CONTRACT_PROMPT,
    "Pour chaque aliment, renseigne novaGroup avec 1, 2, 3 ou 4 seulement lorsque le niveau de transformation est raisonnablement identifiable ; null sinon. N'infère jamais NOVA depuis le seul caractère sain ou malsain d'un aliment. Renseigne sugarExposure avec concentrated=true pour un sucre concentré (sirop, confiture, fruit séché ou jus) et liquid=true pour une forme liquide ; les deux peuvent être vrais. Si l'axe sucre a été examiné et qu'aucune exposition n'est observée, utilise {concentrated:false, liquid:false}; si la forme ou la recette est inconnue, utilise null.",
    MEAL_QUALITY_CONTRACT_PROMPT + " Si l'axe a été examiné et aucun rôle actif n'est observé, utilise []; si l'information est insuffisante, transmets qualityProperties=null dans le JSON. Ne déduis jamais une qualité globale.",
    "Renseigne observation avec le statut de chaque axe : observed si une valeur est soutenue, none_observed si l'axe a été examiné sans propriété observée, unknown si la preuve manque. Pour portion et novaGroup, utilise uniquement observed ou unknown. Ajoute confidence avec low, medium ou high pour chacun des quatre axes, séparément de la confiance globale.",
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme éléments inferred/unknown structurés quand elles sont pertinentes, sans en inventer la quantité. Utilise kind, parentId, evidence, evidenceSource et quantity seulement quand ils sont justifiés.",
    "Estime la nutrition en fourchettes larges, pas en fausse précision. Pour chaque fourchette non-nulle, fournis low, likely et high avec low <= likely <= high. Utilise null quand un nutriment ne peut pas être estimé de façon responsable.",
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Ne fabrique aucune quantité : quantity et estimatedGrams restent null quand la description ne permet pas une estimation responsable.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "confidence à low par défaut, sauf si la description est très précise (aliments, quantités et préparation explicites). Remplis uncertaintySignals avec des codes structurés et un détail concret pour chaque incertitude importante ; conserve aussi uncertainties pour une explication lisible.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    `User description: ${input.note}`,
    input.correction ? `User correction to apply: ${input.correction}` : "No user correction was supplied.",
    previousAnalysisPrompt(input.previousAnalysis),
    recipeReferencesPrompt(input.recipeReferences),
  ].join("\n");
}

export function makePrompt(input: MealVisionInput) {
  const origins = input.images.map((image, index) => `Photo ${index + 1} id: ${image.id} source: ${image.origin}`).join("\n");
  return [
    "Analyse these photos as one meal for a personal food journal. Réponds avec des libellés en français.",
    "Identify only foods and drinks that are visible or strongly supported by the images. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support.",
    MEAL_PHOTO_EVIDENCE_CONTRACT_PROMPT,
    "dishType : nom du type de plat en français en 2-4 mots (par exemple « Salade composée », « Bowl de riz au poulet »), ou null si indéterminable (unclear).",
    "Pour chaque aliment : attribue un id local unique (par exemple food-1), name en français ; portion/quantityLabel en français seulement si visuellement estimable (par exemple « 1 bol », « 2 tranches »), sinon null ; ne jamais deviner les grammes : estimatedGrams à null si non estimable.",
    "Pour un plat composé, utilise kind=dish pour le plat et kind=component ou ingredient pour ses éléments seulement si cela clarifie ce qui est visible. Chaque parentId doit référencer l'id du plat parent. Ne double jamais le plat avec ses composants : si les composants sont comptés dans les totaux, countedInTotals=false pour le plat parent.",
    "Pour chaque aliment, renseigne course avec starter, main, side ou dessert seulement si sa place est justifiée par la note ou une preuve claire ; utilise null sinon. course sert uniquement à structurer l'affichage (entrée, plat, accompagnement, dessert), pas à juger l'aliment.",
    "Pour chaque aliment, renseigne foodGroups avec les grandes familles alimentaires visibles ou fortement inférées. Renseigne varietyKey avec un nom canonique court en français pour reconnaître le même aliment dans le temps (par exemple « tomate », « poulet », « riz »), ou null si l'identité est trop incertaine. Renseigne alcoholic=true uniquement pour une boisson ou un aliment alcoolisé : l'alcool est conservé pour trace mais exclu des dimensions du score et ne doit pas être inclus dans countedInTotals ni dans les totaux nutritionnels. Ces champs décrivent la composition ; ils ne constituent pas un jugement de qualité.",
    MEAL_VARIETY_CONTRACT_PROMPT,
    "Pour chaque aliment, renseigne novaGroup avec 1, 2, 3 ou 4 seulement lorsque le niveau de transformation est raisonnablement identifiable depuis la photo ou la note ; null sinon. N'infère jamais NOVA depuis le seul caractère sain ou malsain. Pour sugarExposure, indique concentrated=true pour un sucre concentré (sirop, confiture, fruit séché ou jus) et liquid=true pour une forme liquide ; si l'axe est examiné sans exposition, utilise {concentrated:false, liquid:false}; si la forme ou la recette est inconnue, utilise null.",
    MEAL_QUALITY_CONTRACT_PROMPT + " Utilise [] si l'axe a été examiné et aucun rôle actif n'est observé ; transmets qualityProperties=null si l'information est inconnue. Ne déduis jamais une qualité globale.",
    "Renseigne observation avec observed, none_observed ou unknown pour portion, novaGroup, sugarExposure et qualityProperties. Pour portion et novaGroup, none_observed n'est pas valide : utilise unknown si la preuve manque. Ajoute confidence avec low, medium ou high pour chacun des quatre axes, séparément de la confiance globale.",
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme aliments structurés avec evidence=inferred ou evidence=unknown et evidenceSource=photo, note ou model selon la preuve. Si une photo justifie l'aliment, reporte son identifiant dans evidencePhotoIds. Ne les invente pas et ne fabrique aucune quantité ; quantity.value, quantity.grams et estimatedGrams restent null lorsque la photo ne permet pas de les estimer.",
    "Estimate portion sizes and nutrition as ranges, not false precision. For every non-null range provide low, likely, and high values with low <= likely <= high. Use null when a nutrient cannot be estimated responsibly.",
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Les champs de confiance et d'incertitude sont internes au contrat, pas une consigne d'affichage.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "Include the main preparation (for example grilled, fried, raw, or with sauce) only when visible or stated.",
    "Return a concise summary, itemized foods, total calories and macros, confidence, legacy uncertainties, and structured uncertaintySignals with code, field, foodId, severity, and concrete detail.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    input.correction ? `User correction to apply: ${input.correction}` : "No user correction was supplied.",
    previousAnalysisPrompt(input.previousAnalysis),
    recipeReferencesPrompt(input.recipeReferences),
    origins,
  ].join("\n");
}

function makeVerificationPrompt(input: MealVisionVerificationInput) {
  return [
    "Relis cette analyse primaire d'un repas avec bienveillance et précision pour un journal alimentaire personnel. Réponds avec des libellés en français.",
    "Vérifie les ids uniques, les quantités, les plats composés, les parentId, les doublons entre un plat et ses composants, les sauces/préparations plausibles, les foodGroups, les varietyKey, le label alcoholic, les statuts observation, les labels de transformation et d'exposition au sucre, et la cohérence nutritionnelle avec les photos et la note. Les intervalles des aliments comptés doivent seulement rester compatibles avec l'intervalle des totaux ; n'exige jamais une addition exacte des bornes. Corrige seulement lorsqu'une preuve visuelle, textuelle ou une contradiction forte le justifie ; sinon conserve l'analyse primaire.",
    MEAL_PHOTO_EVIDENCE_CONTRACT_PROMPT,
    MEAL_VARIETY_CONTRACT_PROMPT,
    MEAL_QUALITY_CONTRACT_PROMPT,
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Un parent kind=dish ne doit pas être compté avec ses composants comptés ; alcoholic=true impose countedInTotals=false et aucune valeur nutritionnelle de contribution. Ne fabrique jamais une quantité, un ingrédient caché ou une précision nutritionnelle. Les traces plausibles de sauce ou d'huile peuvent rester structurées en inferred/unknown avec leur source. Si une photo justifie l'aliment, conserve son identifiant dans evidencePhotoIds.",
    "Ne transforme pas unknown en none_observed : unknown signifie que l'axe n'est pas déterminable, tandis que none_observed signifie qu'il a été examiné et qu'aucune propriété n'a été observée. Pour qualityProperties, transmets null si unknown et [] seulement pour none_observed. Pour sugarExposure, utilise null si unknown et {concentrated:false, liquid:false} si none_observed.",
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Les champs confidence, uncertainties et uncertaintySignals restent internes à l'analyse.",
    "Une correction utilisateur éventuelle est une indication en langage naturel, à appliquer seulement si elle est compatible avec les preuves.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    input.correction ? `User correction to apply: ${input.correction}` : "No user correction was supplied.",
    previousAnalysisPrompt(input.previousAnalysis),
    recipeReferencesPrompt(input.recipeReferences),
    `Primary analysis: ${JSON.stringify(input.primaryAnalysis)}`,
    input.images.length > 0 ? originsForVerification(input) : "No photo was supplied; verify only against the description and the primary analysis.",
  ].join("\n");
}

function originsForVerification(input: MealVisionVerificationInput) {
  return input.images.map((image, index) => `Photo ${index + 1} id: ${image.id} source: ${image.origin}`).join("\n");
}

type StructuredRequest = {
  provider: "xai" | "openai";
  endpoint: string;
  apiKeyEnv: "XAI_API_KEY" | "OPENAI_API_KEY";
  model: string;
  instructions: string;
  promptText: string;
  imageContents: Array<{ type: string; image_url: string; detail: string }>;
  maxOutputTokens: number;
  /** Source ids are used only for deterministic evidence validation. */
  sourcePhotoIds?: readonly string[];
  requestId?: string;
  reasoningEffort?: string;
  maxAttempts?: number;
  /** Abort a provider request instead of holding a worker lease forever. */
  timeoutMs?: number;
};

export async function requestStructuredMealAnalysis(request: StructuredRequest) {
  const imageCount = request.imageContents.length;
  let apiKey: string;
  try {
    apiKey = requireServerEnv(request.apiKeyEnv);
  } catch (error) {
    throw new MealVisionError("provider_auth", providerMessage(request.provider, "provider_auth"), { cause: error, provider: request.provider, requestId: request.requestId, retryable: false });
  }
  let lastError: unknown;
  let retryWithLargerBudget = false;
  const maxAttempts = request.maxAttempts ?? MAX_PROVIDER_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // A truncated structured response cannot be repaired by sending the same
    // request again. Give only a retry explicitly marked as token-truncated a
    // larger completion budget while keeping network/rate-limit retries lean.
    const maxOutputTokens = retryWithLargerBudget ? Math.min(request.maxOutputTokens * 2, 12_000) : request.maxOutputTokens;
    const payload = {
      model: request.model,
      store: false,
      reasoning: { effort: request.reasoningEffort || "low" },
      max_output_tokens: maxOutputTokens,
      instructions: request.instructions,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: request.promptText }, ...request.imageContents],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "soma_meal_analysis",
          strict: true,
          schema: mealAnalysisJsonSchema(),
        },
      },
    };
    const payloadBytes = JSON.stringify(payload).length;
    const startedAt = Date.now();
    let response: Response;
    const timeoutMs = providerTimeoutMs(imageCount === 0 ? TEXT_PROVIDER_TIMEOUT_MS : DEFAULT_PROVIDER_TIMEOUT_MS, request.timeoutMs);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(request.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const code: MealVisionErrorCode = timeout ? "provider_timeout" : "provider_unavailable";
      const classified = new MealVisionError(code, providerMessage(request.provider, code), { cause: error, provider: request.provider, requestId: request.requestId, retryable: true });
      console.error("[meal-analysis] provider request failed", {
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        stage: "provider_request",
        attempt,
        imageCount,
        payloadBytes,
        durationMs: Date.now() - startedAt,
        code,
        reason: error instanceof Error ? error.name : "unknown",
      });
      clearTimeout(timeoutId);
      lastError = classified;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
        continue;
      }
      throw classified;
    }
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      clearTimeout(timeoutId);
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      const code: MealVisionErrorCode = response.status === 401 || response.status === 403
        ? "provider_auth"
        : response.status === 429
          ? "provider_rate_limited"
          : response.status === 408 || response.status === 425
            ? "provider_timeout"
            : response.status >= 500
              ? "provider_unavailable"
              : "provider_request";
      const classified = new MealVisionError(code, providerMessage(request.provider, code), {
        provider: request.provider,
        status: response.status,
        requestId: request.requestId,
        retryable,
        retryAfterMs: retryAfterMs(response),
      });
      console.error("[meal-analysis] provider returned an error", {
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        stage: "provider_response",
        attempt,
        imageCount,
        payloadBytes,
        durationMs,
        status: response.status,
        code,
      });
      lastError = classified;
      if (retryable && attempt < maxAttempts) {
        const delay = classified.retryAfterMs ?? (250 + Math.floor(Math.random() * 500));
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw classified;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const code = timeout ? "provider_timeout" : "response_parse_error";
      console.error("[meal-analysis] provider response could not be decoded", {
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        stage: "response_decode",
        attempt,
        imageCount,
        payloadBytes,
        durationMs,
        code,
        reason: error instanceof Error ? error.name : "unknown",
      });
      const classified = new MealVisionError(code, providerMessage(request.provider, code), { cause: error, provider: request.provider, requestId: request.requestId, retryable: timeout });
      if (timeout && attempt < maxAttempts) {
        lastError = classified;
        await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
        continue;
      }
      throw classified;
    }
    clearTimeout(timeoutId);
    const responseStatus = body && typeof body === "object" && typeof (body as { status?: unknown }).status === "string"
      ? (body as { status: string }).status
      : undefined;
    const incompleteReason = body && typeof body === "object" && (body as { incomplete_details?: unknown }).incomplete_details && typeof (body as { incomplete_details?: unknown }).incomplete_details === "object"
      ? (body as { incomplete_details: { reason?: unknown } }).incomplete_details.reason
      : undefined;
    const text = responseText(body);

    // Some Responses-compatible payloads can carry a complete JSON object
    // even when the top-level status is marked incomplete. Parse and validate
    // it first; the schema remains the final guard before persistence.
    if (text) {
      let parsed: unknown;
      try {
        parsed = structuredJson(text);
      } catch (error) {
        if (responseStatus !== "incomplete" || attempt >= maxAttempts) {
          console.error("[meal-analysis] provider content was not parseable JSON", {
            requestId: request.requestId,
            provider: request.provider,
            model: request.model,
            stage: "response_parse",
            attempt,
            imageCount,
            payloadBytes,
            durationMs,
            code: "response_parse_error",
            reason: error instanceof Error ? error.name : "unknown",
          });
          if (error instanceof MealVisionError) throw new MealVisionError("response_parse_error", error.message, { cause: error, provider: request.provider, requestId: request.requestId, retryable: false });
          throw error;
        }
      }

      if (parsed !== undefined) {
        try {
          const result = validateMealAnalysis(parsed, { sourcePhotoIds: request.sourcePhotoIds });
          console.info("[meal-analysis] provider succeeded", {
            requestId: request.requestId,
            provider: request.provider,
            model: request.model,
            stage: "provider_success",
            attempt,
            imageCount,
            payloadBytes,
            durationMs,
          });
          return result;
        } catch (error) {
          if (responseStatus !== "incomplete" && attempt < maxAttempts) {
            // A complete JSON envelope can still contain a transiently
            // incoherent model answer. Retry the same strict contract once;
            // never repair the payload or persist it before validation passes.
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
            continue;
          }
          if (responseStatus !== "incomplete" || attempt >= maxAttempts) {
            console.error("[meal-analysis] provider content failed schema validation", {
              requestId: request.requestId,
              provider: request.provider,
              model: request.model,
              stage: "response_schema",
              attempt,
              imageCount,
              payloadBytes,
              durationMs,
              code: "response_schema_error",
              reason: error instanceof Error ? error.name : "unknown",
            });
            throw new MealVisionError("response_schema_error", "Le provider a retourné une analyse structurée incohérente (invalid structured meal analysis).", { cause: error, provider: request.provider, requestId: request.requestId, retryable: false });
          }
        }
      }
    }

    if (responseStatus === "incomplete") {
      const outputLimitReached = incompleteReason === "max_output_tokens" || incompleteReason === "max_tokens";
      console.error("[meal-analysis] provider returned an incomplete response", {
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        stage: "response_incomplete",
        attempt,
        imageCount,
        payloadBytes,
        durationMs,
        reason: typeof incompleteReason === "string" ? incompleteReason : "unknown",
        retryMaxOutputTokens: maxOutputTokens,
        ...responseDiagnostics(body),
        code: "provider_empty_response",
      });
      const incompleteError = new MealVisionError("provider_empty_response", providerMessage(request.provider, "provider_empty_response"), { provider: request.provider, requestId: request.requestId });
      lastError = incompleteError;
      if (attempt < maxAttempts) {
        retryWithLargerBudget = outputLimitReached;
        await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
        continue;
      }
      throw incompleteError;
    }
    if (!text) {
      console.error("[meal-analysis] provider returned no structured content", {
        requestId: request.requestId,
        provider: request.provider,
        model: request.model,
        stage: "response_empty",
        attempt,
        imageCount,
        payloadBytes,
        durationMs,
        ...responseDiagnostics(body),
        code: "provider_empty_response",
      });
      const emptyError = new MealVisionError("provider_empty_response", providerMessage(request.provider, "provider_empty_response"), { provider: request.provider, requestId: request.requestId });
      lastError = emptyError;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
        continue;
      }
      throw emptyError;
    }
  }
  throw lastError instanceof Error ? lastError : new MealVisionError("provider_unavailable", providerMessage(request.provider, "provider_unavailable"), { provider: request.provider, requestId: request.requestId });
}

async function requestGrokAnalysis({ model, instructions, promptText, imageContents, maxOutputTokens, sourcePhotoIds, requestId, maxAttempts, timeoutMs }: {
  model: string;
  instructions: string;
  promptText: string;
  imageContents: Array<{ type: string; image_url: string; detail: string }>;
  maxOutputTokens: number;
  sourcePhotoIds?: readonly string[];
  requestId?: string;
  maxAttempts?: number;
  timeoutMs?: number;
}) {
  return requestStructuredMealAnalysis({
    provider: "xai",
    endpoint: process.env.XAI_RESPONSES_URL || "https://api.x.ai/v1/responses",
    apiKeyEnv: "XAI_API_KEY",
    model,
    instructions,
    promptText,
    imageContents,
    maxOutputTokens,
    sourcePhotoIds,
    requestId,
    maxAttempts,
    timeoutMs,
  });
}

async function requestOpenAiMealValidation(input: MealVisionVerificationInput, model: string, timeoutMs?: number) {
  return requestStructuredMealAnalysis({
    provider: "openai",
    endpoint: process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses",
    apiKeyEnv: "OPENAI_API_KEY",
    model,
    instructions: MEAL_VALIDATOR_PROVIDER_INSTRUCTIONS,
    promptText: makeVerificationPrompt(input),
    // The validator receives the same visual evidence at full detail. Any
    // lower-resolution path requires a quality benchmark and is deliberately
    // not enabled by default.
    imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" })),
    maxOutputTokens: 6_000,
    sourcePhotoIds: input.images.map((image) => image.id),
    reasoningEffort: process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT || "low",
    requestId: input.requestId,
    maxAttempts: 1,
    timeoutMs,
  });
}

export function createXaiMealVisionProvider(options: { maxAttempts?: number; timeoutMs?: number } = {}): MealVisionProvider {
  const model = process.env.XAI_MEAL_VISION_MODEL || "grok-4.6";
  const xaiValidatorModel = process.env.XAI_MEAL_VALIDATOR_MODEL || model;
  const openAiValidatorModel = process.env.OPENAI_MEAL_VALIDATOR_MODEL || "gpt-5.6-sol";
  const validator: MealVisionProvider["verify"] = process.env.OPENAI_API_KEY
    ? (input) => requestOpenAiMealValidation(input, openAiValidatorModel, VALIDATOR_TIMEOUT_MS)
    : process.env.XAI_MEAL_VALIDATOR_MODEL
      ? (input) => requestGrokAnalysis({
        model: xaiValidatorModel,
        instructions: MEAL_VALIDATOR_PROVIDER_INSTRUCTIONS,
        promptText: makeVerificationPrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" as VisionImageDetail })),
        maxOutputTokens: 6_000,
        sourcePhotoIds: input.images.map((image) => image.id),
        requestId: input.requestId,
        maxAttempts: 1,
        timeoutMs: VALIDATOR_TIMEOUT_MS,
      })
      : undefined;
  return {
    name: "xai",
    model,
    ...(validator ? {
      verification: process.env.OPENAI_API_KEY
        ? { provider: "openai", model: openAiValidatorModel }
        : { provider: "xai", model: xaiValidatorModel },
    } : {}),
    async analyze(input) {
      return requestGrokAnalysis({
        model,
        instructions: MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" as VisionImageDetail })),
        maxOutputTokens: 6_000,
        sourcePhotoIds: input.images.map((image) => image.id),
        requestId: input.requestId,
        maxAttempts: options.maxAttempts,
        timeoutMs: options.timeoutMs ?? providerTimeoutMs(DEFAULT_PROVIDER_TIMEOUT_MS),
      });
    },
    async analyzeText(input) {
      return requestGrokAnalysis({
        model,
        instructions: MEAL_TEXT_PROVIDER_INSTRUCTIONS,
        promptText: makeTextPrompt(input),
        imageContents: [],
        maxOutputTokens: 3_000,
        sourcePhotoIds: [],
        requestId: input.requestId,
        maxAttempts: options.maxAttempts,
        timeoutMs: options.timeoutMs ?? providerTimeoutMs(TEXT_PROVIDER_TIMEOUT_MS),
      });
    },
    ...(validator ? { verify: validator } : {}),
  };
}

export function getMealVisionProvider(): MealVisionProvider {
  return createXaiMealVisionProvider();
}

function validateProviderResult(value: MealAnalysis, sourcePhotoIds: readonly string[], provider: MealVisionProvider) {
  try {
    // Built-in adapters already return the canonical parsed value. Validate
    // custom providers as well, but preserve their object shape so adding this
    // guard does not unexpectedly inject defaults into existing integrations.
    validateMealAnalysis(value, { sourcePhotoIds });
    return value;
  } catch (error) {
    if (error instanceof MealVisionError) throw error;
    throw new MealVisionError(
      "response_schema_error",
      "Le provider a retourné une analyse structurée incohérente (invalid structured meal analysis).",
      { cause: error, provider: provider.name, requestId: undefined, retryable: false },
    );
  }
}

export async function analyzeMealImages(input: MealVisionInput, provider: MealVisionProvider = getMealVisionProvider()) {
  const result = await provider.analyze(input);
  return { result, provider: provider.name, model: provider.model };
}

export async function analyzeMealText(input: MealVisionTextInput, provider: MealVisionProvider = getMealVisionProvider()) {
  if (!provider.analyzeText) throw new Error("This meal analysis provider does not support text-only analysis.");
  const result = await provider.analyzeText(input);
  return { result, provider: provider.name, model: provider.model };
}

/**
 * Dispatches one meal analysis according to the available evidence.
 *
 * A meal with at least one available image always uses the vision method once;
 * its note is part of that same request. Only a note-only meal uses the
 * provider's text-only method. The optional validator runs by default and
 * falls back to the primary result when it fails.
 */
export async function analyzeMealInput(input: MealVisionInput, provider: MealVisionProvider = getMealVisionProvider(), options: { verify?: boolean; requestId?: string } = {}) {
  const providerInput = options.requestId && !input.requestId ? { ...input, requestId: options.requestId } : input;
  const recipeContext = input.recipeReferences?.length ? { recipeReferences: input.recipeReferences } : {};
  const primaryResponse = input.images.length > 0
    ? await provider.analyze(providerInput)
    : await (async () => {
      const note = input.note?.trim() ?? "";
      if (!note) throw new Error("A meal needs a note or at least one image before analysis.");
      if (!provider.analyzeText) throw new Error("This meal analysis provider does not support text-only analysis.");
      return provider.analyzeText({
        mealType: input.mealType,
        mealDate: input.mealDate,
        note,
        ...(input.correction ? { correction: input.correction } : {}),
        ...(input.previousAnalysis ? { previousAnalysis: input.previousAnalysis } : {}),
        ...(providerInput.requestId ? { requestId: providerInput.requestId } : {}),
        ...recipeContext,
      });
    })();
  const sourcePhotoIds = input.images.map((image) => image.id);
  const primary = validateProviderResult(primaryResponse, sourcePhotoIds, provider);

  let result = primary;
  let validation = {
    requested: options.verify !== false,
    configured: Boolean(provider.verify),
    attempted: false,
    succeeded: false,
    provider: provider.verification?.provider ?? null,
    model: provider.verification?.model ?? null,
  };
  if (options.verify !== false && provider.verify) {
    validation = { ...validation, attempted: true };
    try {
      result = validateProviderResult(await provider.verify({ ...providerInput, primaryAnalysis: primary }), sourcePhotoIds, provider);
      validation = { ...validation, succeeded: true };
    } catch (error) {
      console.warn("[meal-analysis] optional verification failed; primary result preserved", {
        requestId: providerInput.requestId,
        provider: provider.name,
        model: provider.model,
        stage: "verification",
        code: error instanceof MealVisionError ? error.code : "unknown",
      });
      result = primary;
    }
  }
  const finalProvider = validation.succeeded && provider.verification
    ? provider.verification
    : { provider: provider.name, model: provider.model };
  return { result, provider: finalProvider.provider, model: finalProvider.model, validation };
}
