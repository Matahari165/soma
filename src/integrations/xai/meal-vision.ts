import "server-only";

import { createHash } from "node:crypto";

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
import { z } from "zod";

export type MealVisionImage = {
  id: string;
  mimeType: string;
  origin: MealOrigin;
  comment?: string | null;
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
  /** Internal retry guidance only; never pass user text or provider payloads. */
  retryHint?: string;
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
  /** Internal retry guidance only; never pass user text or provider payloads. */
  retryHint?: string;
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

export type GrokStreamProgressEvent =
  | { type: "reasoning"; delta: string; text?: string }
  | { type: "text_delta"; delta: string }
  | { type: "dish_detected"; dishType: string }
  | { type: "food_detected"; food: string };

export type MealVisionProvider = {
  name: string;
  model: string;
  analyze(input: MealVisionInput): Promise<MealAnalysis>;
  analyzeText?(input: MealVisionTextInput): Promise<MealAnalysis>;
  analyzeStream?(input: MealVisionInput, onProgress?: (event: GrokStreamProgressEvent) => void): Promise<MealAnalysis>;
  analyzeTextStream?(input: MealVisionTextInput, onProgress?: (event: GrokStreamProgressEvent) => void): Promise<MealAnalysis>;
};

export type MealVisionVerificationInput = MealVisionInput & {
  primaryAnalysis: MealAnalysis;
};

/** xAI image understanding currently accepts JPEG/JPG and PNG input. */
export function isXaiVisionMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/png";
}

const MAX_PROVIDER_ATTEMPTS = 2;
// Leave eight seconds in the 60-second worker for photo I/O and persistence.
// A real three-photo request crossed the former 45-second cap.
const DEFAULT_PROVIDER_TIMEOUT_MS = 52_000;
const MAX_PROVIDER_TIMEOUT_MS = 52_000;
const TEXT_PROVIDER_TIMEOUT_MS = 52_000;

function providerTimeoutMs(fallback: number, requested?: number) {
  const configured = requested ?? Number(process.env.MEAL_ANALYSIS_PROVIDER_TIMEOUT_MS || fallback);
  return Number.isFinite(configured)
    ? Math.min(MAX_PROVIDER_TIMEOUT_MS, Math.max(1_000, configured))
    : fallback;
}

/** Bump these identifiers whenever the provider contract changes. */
export const MEAL_ANALYSIS_PROMPT_VERSION = "meal-analysis-prompt-v7";
export const MEAL_ANALYSIS_SCHEMA_VERSION = "meal-analysis-schema-v2";

/** A stable, versioned cache identifier that stays under OpenAI's 64-character limit. */
function mealPromptCacheKey(provider: string, model: string, attempt: number, stream = false) {
  const fingerprint = createHash("sha256")
    .update([MEAL_ANALYSIS_PROMPT_VERSION, MEAL_ANALYSIS_SCHEMA_VERSION, provider, model, attempt, stream].join(":"))
    .digest("hex")
    .slice(0, 24);
  return `soma-meal-${fingerprint}`;
}

type VisionImageDetail = "low" | "high" | "auto";

const MEAL_PHOTO_EVIDENCE_CONTRACT_PROMPT = "Traite chaque photo comme une preuve indépendante : plusieurs photos montrent généralement des éléments différents du même repas. Conserve ces aliments séparément. Ne fusionne que si tu reconnais clairement le même aliment ou la même portion sous des angles différents ; dans ce cas, garde un seul food et toutes les evidencePhotoIds correspondantes. Ne déduplique jamais seulement parce que deux noms se ressemblent. Chaque evidencePhotoIds doit contenir uniquement un alias exact photo-N listé dans les références de la demande (par exemple photo-1 ou photo-2), jamais un identifiant inventé ou un identifiant technique, et tout aliment attribué à une photo doit référencer au moins une de ces photos.";

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
const MEAL_OBSERVATION_CONTRACT_PROMPT = "Les statuts observation et leurs valeurs doivent toujours correspondre : si portion, estimatedGrams, quantity.value ou quantity.grams contient une valeur, observation.portion doit être observed ; si observation.portion est unknown, portion, estimatedGrams, quantity.value et quantity.grams doivent tous être null. Si novaGroup est non-null, observation.novaGroup doit être observed ; s'il est unknown, novaGroup doit être null. Si sugarExposure est unknown, sugarExposure doit être null. Si qualityProperties est unknown, qualityProperties doit être null.";

export const MEAL_PHOTO_PROVIDER_INSTRUCTIONS = `You are a careful food-photo analyst. Return stable food ids, per-axis observation statuses and per-axis confidence. Treat each supplied photo as independent evidence: several photos usually show different parts or elements of the same meal, so keep distinct foods distinct. Merge only when it is clear that two photos show the same food or portion from another angle; then keep one food item and list every supporting photo id in evidencePhotoIds. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Every evidencePhotoIds value must be one of the exact photo-N aliases listed in the user request, and a photo-supported food must reference at least one of them. Never emit technical source identifiers or invented aliases. Use ranges with low <= likely <= high, explicit nulls when not estimable, and structured uncertainty signals for important unknowns. Missing nutrition is never zero. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Labels in French. Return only the requested JSON object.`;

export const MEAL_TEXT_PROVIDER_INSTRUCTIONS = `You are a careful food-description analyst. List only foods named in the user description and return stable food ids with structured observation statuses. Nutrition ranges may be estimated from a clearly identified food and an ordinary serving even when its amount is unstated: use broad low/likely/high ranges, low confidence, and an explicit serving-size assumption in uncertainties. This assumption does not turn portion, quantity, or estimatedGrams into observed facts; leave those fields null when unsupported. Never invent exact grams or nutrition precision the description cannot support. Use null only when even a broad responsible estimate is impossible; missing nutrition is never zero. Default confidence to low unless the description is very precise. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Always include 'Estimation à partir de la seule description, sans photo.' in uncertainties and machine-readable uncertaintySignals for important unknowns. A text-only food must use an empty evidencePhotoIds array and must not claim photo evidence. Labels in French. Return only the requested JSON object.`;

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
      summary: { type: "string", maxLength: 160 },
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
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"' && depth > 0) {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
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

function clampRangeValues(range: unknown): { low: number; likely: number; high: number } | null {
  if (!range || typeof range !== "object" || Array.isArray(range)) return null;
  const r = range as Record<string, unknown>;
  const rawLow = normalizeNumericFields(r.low);
  const rawLikely = normalizeNumericFields(r.likely);
  const rawHigh = normalizeNumericFields(r.high);
  if (typeof rawLow !== "number" || typeof rawLikely !== "number" || typeof rawHigh !== "number") return null;
  if (!Number.isFinite(rawLow) || !Number.isFinite(rawLikely) || !Number.isFinite(rawHigh)) return null;
  const low = Math.max(0, rawLow);
  const likely = Math.max(low, rawLikely);
  const high = Math.max(likely, rawHigh);
  return { low, likely, high };
}

function clampSugarInvariants(item: { carbohydrateGrams?: unknown; sugarGrams?: unknown; addedSugarGrams?: unknown }) {
  const carbs = item.carbohydrateGrams as { low: number; likely: number; high: number } | null | undefined;
  const sugar = item.sugarGrams as { low: number; likely: number; high: number } | null | undefined;
  const added = item.addedSugarGrams as { low: number; likely: number; high: number } | null | undefined;
  if (carbs && sugar) {
    if (sugar.likely > carbs.likely) {
      sugar.likely = carbs.likely;
    }
    if (sugar.low > carbs.low) {
      sugar.low = Math.min(carbs.low, sugar.likely);
    }
    if (sugar.high > carbs.high) {
      sugar.high = Math.max(sugar.likely, carbs.high);
    }
  }
  if (sugar && added) {
    if (added.likely > sugar.likely) {
      added.likely = sugar.likely;
    }
    if (added.low > sugar.low) {
      added.low = Math.min(sugar.low, added.likely);
    }
    if (added.high > sugar.high) {
      added.high = Math.max(added.likely, sugar.high);
    }
  }
}

function photoAlias(index: number) {
  return `photo-${index + 1}`;
}

/**
 * Providers see short, positional aliases instead of opaque source UUIDs.
 * Canonical source IDs are still accepted for compatibility, while every
 * unknown value is deliberately left untouched so the source-aware validator
 * rejects it rather than silently accepting invented evidence.
 */
function remapEvidencePhotoAliases(value: unknown, sourcePhotoIds?: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !sourcePhotoIds) return value;

  const sourceIds = new Set(sourcePhotoIds);
  const aliases = new Map(sourcePhotoIds.map((sourceId, index) => [photoAlias(index), sourceId]));
  const source = value as Record<string, unknown>;
  const rawFoods = Array.isArray(source.foods) ? source.foods : [];
  const foods = rawFoods.map((food) => {
    if (!food || typeof food !== "object" || Array.isArray(food)) return food;
    const item = food as Record<string, unknown>;
    if (!Array.isArray(item.evidencePhotoIds)) return food;
    const evidencePhotoIds = item.evidencePhotoIds.map((photoId) => {
      if (typeof photoId !== "string") return photoId;
      const normalizedId = photoId.trim();
      if (sourceIds.has(normalizedId)) return normalizedId;
      return aliases.get(normalizedId) ?? normalizedId;
    });
    return { ...item, evidencePhotoIds };
  });

  return { ...source, foods };
}

const STRUCTURED_NUTRITION_FIELDS = [
  "calories",
  "proteinGrams",
  "carbohydrateGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "addedSugarGrams",
] as const;

function harmonizeTotalsOverlap(
  totals: Record<string, unknown>,
  countedFoods: Array<Record<string, unknown>>,
) {
  if (!countedFoods.length) return;
  STRUCTURED_NUTRITION_FIELDS.forEach((field) => {
    const totalRange = totals[field] as { low: number; likely: number; high: number } | null | undefined;
    if (!totalRange) return;
    const foodRanges = countedFoods
      .map((food) => food[field] as { low: number; likely: number; high: number } | null | undefined)
      .filter((r): r is { low: number; likely: number; high: number } => Boolean(r));
    if (foodRanges.length !== countedFoods.length) return;
    const sumLow = foodRanges.reduce((sum, r) => sum + r.low, 0);
    const sumHigh = foodRanges.reduce((sum, r) => sum + r.high, 0);
    if (sumHigh < totalRange.low) {
      totalRange.low = Math.min(totalRange.low, sumHigh);
      if (totalRange.likely < totalRange.low) totalRange.likely = totalRange.low;
    }
    if (totalRange.high < sumLow) {
      totalRange.high = Math.max(totalRange.high, sumLow);
      if (totalRange.likely > totalRange.high) totalRange.likely = totalRange.high;
    }
  });
}

export function normalizeStructuredAnalysis(value: unknown, sourcePhotoIds?: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = remapEvidencePhotoAliases(value, sourcePhotoIds) as Record<string, unknown>;
  const rawFoods = Array.isArray(source.foods) ? source.foods : [];

  const normalizeFood = (food: unknown, foodIndex: number) => {
    if (!food || typeof food !== "object" || Array.isArray(food)) return food;
    const item = food as Record<string, unknown>;
    const quantity = item.quantity && typeof item.quantity === "object" && !Array.isArray(item.quantity)
      ? {
        ...(item.quantity as Record<string, unknown>),
        value: normalizeNumericFields((item.quantity as Record<string, unknown>).value),
        grams: normalizeNumericFields((item.quantity as Record<string, unknown>).grams),
      }
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
      if (status.qualityProperties === "observed" && Array.isArray(item.qualityProperties) && item.qualityProperties.length === 0) {
        status.qualityProperties = "unknown";
      }
    }
    const normalizedItem: Record<string, unknown> = { ...item };
    let normalizedQuantity = quantity;
    let normalizedEstimatedGrams = normalizeNumericFields(item.estimatedGrams);
    if (observation && typeof observation === "object" && !Array.isArray(observation)) {
      const status = observation as Record<string, unknown>;
      // Strict JSON Schema cannot express these cross-field refinements. Repair
      // contradictions conservatively by dropping unsupported values, never by
      // inventing evidence or upgrading an unknown observation.
      if (status.portion === "unknown") {
        normalizedItem.portion = null;
        normalizedEstimatedGrams = null;
        if (normalizedQuantity && typeof normalizedQuantity === "object" && !Array.isArray(normalizedQuantity)) {
          normalizedQuantity = { ...normalizedQuantity, value: null, grams: null };
        }
      }
      if (status.novaGroup === "unknown") normalizedItem.novaGroup = null;
      if (status.sugarExposure === "unknown") normalizedItem.sugarExposure = null;
      if (status.sugarExposure === "none_observed") normalizedItem.sugarExposure = { concentrated: false, liquid: false };
      if (status.qualityProperties === "unknown") delete normalizedItem.qualityProperties;
      if (status.qualityProperties === "none_observed") normalizedItem.qualityProperties = [];
    }
    // Strict OpenAI schemas require every property to be present. `null` is
    // the wire representation of an unknown descriptive axis; the canonical
    // Zod model represents that same state by omitting qualityProperties.
    if (normalizedItem.qualityProperties === null) delete normalizedItem.qualityProperties;

    // 1. Assure a valid unique string id
    normalizedItem.id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `food-${foodIndex + 1}`;
    normalizedItem.estimatedGrams = normalizedEstimatedGrams;
    normalizedItem.quantity = normalizedQuantity;
    normalizedItem.observation = observation;

    // Ranges clamped
    normalizedItem.calories = clampRangeValues(item.calories);
    normalizedItem.proteinGrams = clampRangeValues(item.proteinGrams);
    normalizedItem.carbohydrateGrams = clampRangeValues(item.carbohydrateGrams);
    normalizedItem.fatGrams = clampRangeValues(item.fatGrams);
    normalizedItem.fiberGrams = clampRangeValues(item.fiberGrams);
    normalizedItem.sugarGrams = item.sugarGrams === undefined ? null : clampRangeValues(item.sugarGrams);
    normalizedItem.addedSugarGrams = item.addedSugarGrams === undefined ? null : clampRangeValues(item.addedSugarGrams);

    clampSugarInvariants(normalizedItem);

    return normalizedItem;
  };

  const foods = rawFoods.map(normalizeFood);

  // Fix duplicate IDs, dish parentId relationships
  if (Array.isArray(foods)) {
    const foodIdSet = new Set<string>();
    foods.forEach((food, index) => {
      if (!food || typeof food !== "object") return;
      const f = food as Record<string, unknown>;
      if (typeof f.id !== "string" || !f.id || foodIdSet.has(f.id)) {
        f.id = `food-${index + 1}`;
      }
      foodIdSet.add(f.id as string);
    });

    const countedDishIds = new Set(foods.flatMap((food) =>
      food && typeof food === "object" && (food as Record<string, unknown>).kind === "dish" && (food as Record<string, unknown>).countedInTotals === true && typeof (food as Record<string, unknown>).id === "string"
        ? [(food as Record<string, unknown>).id as string]
        : []
    ));

    for (let index = 0; index < foods.length; index += 1) {
      const food = foods[index];
      if (!food || typeof food !== "object") continue;
      const f = food as Record<string, unknown>;
      if (typeof f.parentId === "string") {
        if (f.parentId === f.id || !foodIdSet.has(f.parentId)) {
          f.parentId = null;
        } else if (countedDishIds.has(f.parentId) && f.countedInTotals !== false) {
          f.countedInTotals = false;
        }
      }
      if (f.alcoholic === true) {
        f.countedInTotals = false;
      }
    }
  }

  // Totals normalization
  let totals = source.totals && typeof source.totals === "object" && !Array.isArray(source.totals)
    ? Object.fromEntries(Object.entries(source.totals as Record<string, unknown>).map(([key, entry]) => [
      key,
      key.endsWith("Grams") || key === "calories" ? clampRangeValues(entry) : entry,
    ]))
    : source.totals;

  if (totals && typeof totals === "object" && !Array.isArray(totals)) {
    const normalizedTotals = totals as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(normalizedTotals, "sugarGrams")) normalizedTotals.sugarGrams = null;
    if (!Object.prototype.hasOwnProperty.call(normalizedTotals, "addedSugarGrams")) normalizedTotals.addedSugarGrams = null;
    clampSugarInvariants(normalizedTotals);

    // Harmonize totals with counted food sum intervals
    if (Array.isArray(foods)) {
      const counted = foods.filter((f): f is Record<string, unknown> =>
        Boolean(f && typeof f === "object" && (f as Record<string, unknown>).countedInTotals !== false && (f as Record<string, unknown>).alcoholic !== true)
      );
      harmonizeTotalsOverlap(normalizedTotals, counted);
    }
    totals = normalizedTotals;
  }

  // Sanitize uncertainty signals
  let uncertaintySignals = Array.isArray(source.uncertaintySignals) ? source.uncertaintySignals : [];
  if (Array.isArray(foods) && uncertaintySignals.length > 0) {
    const foodIdSet = new Set(foods.map((f) => f && typeof f === "object" && typeof (f as Record<string, unknown>).id === "string" ? (f as Record<string, unknown>).id as string : null).filter(Boolean));
    const seenSignals = new Set<string>();
    const cleaned: Array<Record<string, unknown>> = [];
    for (const rawSignal of uncertaintySignals) {
      if (!rawSignal || typeof rawSignal !== "object" || Array.isArray(rawSignal)) continue;
      const sig = { ...(rawSignal as Record<string, unknown>) };
      if (typeof sig.foodId === "string" && !foodIdSet.has(sig.foodId)) {
        sig.foodId = null;
      }
      const key = `${sig.code}:${sig.field}:${sig.foodId ?? "meal"}`;
      if (seenSignals.has(key)) continue;
      seenSignals.add(key);
      cleaned.push(sig);
      if (cleaned.length >= 20) break;
    }
    uncertaintySignals = cleaned;
  }

  return {
    ...source,
    foods,
    totals,
    uncertaintySignals,
  };
}

function structuredJson(text: string, sourcePhotoIds?: readonly string[]) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [fenced, trimmed, ...balancedJsonCandidates(trimmed)].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  let lastError: unknown;
  let firstParsed: unknown;
  let foundParsed = false;
  for (const candidate of candidates) {
    try {
      const normalized = normalizeStructuredAnalysis(JSON.parse(candidate) as unknown, sourcePhotoIds);
      if (!foundParsed) {
        firstParsed = normalized;
        foundParsed = true;
      }
      // A Responses payload may contain more than one JSON fragment. Select
      // the first complete meal contract instead of the first parseable object.
      try {
        validateMealAnalysis(normalized, { sourcePhotoIds });
        return normalized;
      } catch {
        // Some compatible providers add one named envelope around the final
        // result. Never search arbitrary nested objects (for example a prior
        // analysis) for a plausible meal.
        if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
          const wrapper = normalized as Record<string, unknown>;
          for (const key of ["analysis", "mealAnalysis", "result"]) {
            const inner = wrapper[key];
            if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
            const unwrapped = normalizeStructuredAnalysis(inner, sourcePhotoIds);
            try {
              validateMealAnalysis(unwrapped, { sourcePhotoIds });
              return unwrapped;
            } catch {
              // Keep the outer schema error.
            }
          }
        }
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (foundParsed) return firstParsed;
  throw new MealVisionError("response_parse_error", "La réponse du provider n’est pas un JSON valide.", { cause: lastError });
}

type SafeSchemaDiagnostic = { path: string; code: string };

/** Keep schema telemetry useful without logging model output, values, or secrets. */
function safeSchemaDiagnostics(error: unknown): SafeSchemaDiagnostic[] {
  if (!(error instanceof z.ZodError)) return [{ path: "$", code: "unknown" }];
  return error.issues.slice(0, 12).map((issue) => ({
    path: issue.path.map((segment) => {
      if (typeof segment === "number" && Number.isInteger(segment) && segment >= 0) return String(segment);
      if (typeof segment === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(segment)) return segment;
      return "[redacted]";
    }).join(".") || "$",
    code: issue.code,
  }));
}

function safeRootShape(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { root: Array.isArray(value) ? "array" : typeof value };
  const fields = value as Record<string, unknown>;
  const type = (field: string) => Array.isArray(fields[field]) ? "array" : fields[field] === null ? "null" : typeof fields[field];
  return {
    root: "object",
    summary: type("summary"),
    foods: type("foods"),
    totals: type("totals"),
    uncertainties: type("uncertainties"),
    analysis: type("analysis"),
    mealAnalysis: type("mealAnalysis"),
    result: type("result"),
  };
}

function schemaRetryPrompt(sourcePhotoIds: readonly string[] | undefined, diagnostics: SafeSchemaDiagnostic[]) {
  const paths = diagnostics.length
    ? diagnostics.map(({ path, code }) => `${path}/${code}`).slice(0, 8).join(", ")
    : "$/unknown";
  const aliases = sourcePhotoIds?.length
    ? sourcePhotoIds.map((_, index) => photoAlias(index)).join(", ")
    : "aucun alias photo";
  return [
    "=== CORRECTION TECHNIQUE DE LA TENTATIVE PRÉCÉDENTE ===",
    `La tentative précédente n'a pas respecté le contrat JSON. Corrige uniquement les chemins/code signalés : ${paths}.`,
    `Pour evidencePhotoIds, utilise exclusivement ces alias exacts : ${aliases}. N'invente aucun identifiant et ne renvoie aucun UUID technique.`,
    "Conserve les valeurs réellement inconnues à null, respecte les statuts d'observation et retourne uniquement l'objet JSON demandé.",
  ].join("\n");
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

function previousAnalysisPrompt(previousAnalysis: MealAnalysis | null | undefined, hasCorrection = false) {
  if (!previousAnalysis) return "Aucune analyse précédente n'a été fournie comme référence.";
  return [
    hasCorrection
      ? "Analyse précédente du repas (base à conserver et mettre à jour avec la modification utilisateur ci-dessus) :"
      : "Analyse précédente conservée (référence textuelle uniquement) :",
    `Previous structured analysis: ${JSON.stringify(previousAnalysis)}`,
  ].join("\n");
}

function retryHintPrompt(retryHint: string | null | undefined) {
  const normalized = retryHint?.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!normalized) return "";
  return [
    "=== CONSEIL TECHNIQUE DE REPRISE (ne contient aucune donnée du repas) ===",
    normalized,
    "Respecte ce conseil sans reprendre de contenu de la tentative précédente et retourne uniquement l'objet JSON demandé.",
  ].join("\n");
}

function correctionPrompt(correction: string | null | undefined) {
  if (!correction?.trim()) return "No user correction was supplied.";
  return [
    "=== MODIFICATION / AJOUT EN LANGAGE NATUREL PAR L'UTILISATEUR (PRIORITÉ ABSOLUE) ===",
    `Modification demandée : "${correction.trim()}"`,
    "Consignes impératives pour appliquer cette modification :",
    "1. La demande de l'utilisateur prévaut sur toute déduction visuelle ou textuelle précédente.",
    "2. Conserve TOUS les aliments de l'analyse précédente qui ne sont pas modifiés ou contredits par cette correction.",
    "3. Pour tout aliment ajouté ou modifié via la correction (par exemple un dessert, une boisson, un ingrédient oublié ou une portion corrigée) :",
    "   - S'il n'est pas présent sur les photos fournies, attribue evidenceSource='note', evidence='inferred', evidencePhotoIds=[]. Ne l'exclus JAMAIS.",
    "   - Renseigne son rôle dans course (ex : 'dessert', 'starter', 'side', 'main') et ses macros/calories de façon cohérente.",
    "4. Mets à jour la liste complète des foods du repas pour combiner les aliments conservés et les ajouts/modifications.",
    "5. Recalcule intégralement les totals (calories, protéines, glucides, lipides, fibres, sucres) pour refléter fidèlement le repas complet après modification.",
    "6. Réécris summary pour décrire le repas complet après correction, sans recopier la demande de correction. Garde calorieAnalysis à null.",
  ].join("\n");
}

const MEAL_PRESENTATION_PROMPT = [
  "summary est obligatoire : une seule phrase courte en français (160 caractères maximum) sur la préparation ou une limite importante de l'analyse. Si rien ne distingue le repas, donne une description sobre de l'ensemble.",
  "Ne répète pas dans summary la note utilisateur, la liste foods, les calories ou les macronutriments déjà présents dans totals. N'ajoute ni jugement léger/copieux, ni conseil alimentaire.",
  "calorieAnalysis doit être null : ce champ reste présent uniquement pour le contrat existant. Les calories et macros sont fournies par totals, les incertitudes concrètes par uncertainties et uncertaintySignals. N'ajoute aucun champ au JSON demandé.",
].join(" ");

export function makeTextPrompt(input: MealVisionTextInput) {
  const hasCorrection = Boolean(input.correction);
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
    MEAL_OBSERVATION_CONTRACT_PROMPT,
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme éléments inferred/unknown structurés quand elles sont pertinentes, sans en inventer la quantité. Utilise kind, parentId, evidence, evidenceSource et quantity seulement quand ils sont justifiés.",
    "Estime la nutrition en fourchettes larges, pas en fausse précision. Si l'aliment est identifiable mais sa quantité n'est pas donnée, utilise une hypothèse explicite de portion ordinaire, de petite à généreuse, pour estimer calories et nutriments en fourchettes prudentes ; garde quantity, portion et estimatedGrams à null et la confiance à low. Signale cette hypothèse dans uncertainties et uncertaintySignals. Pour chaque fourchette non-nulle, fournis low, likely et high avec low <= likely <= high. Utilise null seulement quand même une estimation large serait injustifiée.",
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Ne fabrique aucune quantité : quantity et estimatedGrams restent null quand la description ne permet pas une estimation responsable.",
    MEAL_PRESENTATION_PROMPT,
    "confidence à low par défaut, sauf si la description est très précise (aliments, quantités et préparation explicites). Remplis uncertaintySignals avec des codes structurés et un détail concret pour chaque incertitude importante ; conserve aussi uncertainties pour une explication lisible.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    `User description: ${input.note}`,
    correctionPrompt(input.correction),
    previousAnalysisPrompt(input.previousAnalysis, hasCorrection),
    recipeReferencesPrompt(input.recipeReferences),
    retryHintPrompt(input.retryHint),
  ].join("\n");
}

export function makePrompt(input: MealVisionInput) {
  const hasCorrection = Boolean(input.correction);
  const origins = input.images.map((image, index) => {
    const context = image.comment?.trim() ? ` comment: ${image.comment.trim().slice(0, 240)}` : "";
    return `${photoAlias(index)} source: ${image.origin}${context}`;
  }).join("\n");
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
    MEAL_OBSERVATION_CONTRACT_PROMPT,
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme aliments structurés avec evidence=inferred ou evidence=unknown et evidenceSource=photo, note ou model selon la preuve. Si une photo justifie l'aliment, reporte l'alias photo-N correspondant dans evidencePhotoIds. N'utilise jamais d'identifiant technique ou inventé et ne fabrique aucune quantité ; quantity.value, quantity.grams et estimatedGrams restent null lorsque la photo ne permet pas de les estimer.",
    "Estimate portion sizes and nutrition as ranges, not false precision. For every non-null range provide low, likely, and high values with low <= likely <= high. Use null when a nutrient cannot be estimated responsibly.",
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Les champs de confiance et d'incertitude sont internes au contrat, pas une consigne d'affichage.",
    MEAL_PRESENTATION_PROMPT,
    "Include the main preparation (for example grilled, fried, raw, or with sauce) only when visible or stated.",
    "Return a concise summary, itemized foods, total calories and macros, confidence, legacy uncertainties, and structured uncertaintySignals with code, field, foodId, severity, and concrete detail.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    correctionPrompt(input.correction),
    previousAnalysisPrompt(input.previousAnalysis, hasCorrection),
    recipeReferencesPrompt(input.recipeReferences),
    retryHintPrompt(input.retryHint),
    "Photo references (use these exact aliases in evidencePhotoIds; do not use technical source IDs):",
    origins,
  ].join("\n");
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
  /** Source ids stay at the boundary: aliases are remapped before validation. */
  sourcePhotoIds?: readonly string[];
  requestId?: string;
  reasoningEffort?: string;
  maxAttempts?: number;
  /** Extra call reserved for a complete JSON response that fails semantic validation. */
  schemaRepairAttempts?: number;
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
  let schemaRetryInstructions: string | null = null;
  const maxAttempts = request.maxAttempts ?? MAX_PROVIDER_ATTEMPTS;
  const maxSchemaAttempts = maxAttempts + (request.schemaRepairAttempts ?? 0);
  for (let attempt = 1; attempt <= maxSchemaAttempts; attempt += 1) {
    // A truncated structured response cannot be repaired by sending the same
    // request again. Give only a retry explicitly marked as token-truncated a
    // larger completion budget while keeping network/rate-limit retries lean.
    const maxOutputTokens = retryWithLargerBudget ? Math.min(request.maxOutputTokens * 2, 12_000) : request.maxOutputTokens;
    const payload = {
      model: request.model,
      store: false,
      prompt_cache_key: mealPromptCacheKey(request.provider, request.model, attempt),
      reasoning: { effort: request.reasoningEffort || (request.provider === "xai" && request.model.startsWith("grok-4.3") ? "none" : "low") },
      max_output_tokens: maxOutputTokens,
      instructions: request.instructions,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: schemaRetryInstructions ? `${request.promptText}\n${schemaRetryInstructions}` : request.promptText }, ...request.imageContents],
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
        parsed = structuredJson(text, request.sourcePhotoIds);
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
          const diagnostics = safeSchemaDiagnostics(error);
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
            schemaIssues: diagnostics,
            rootShape: safeRootShape(parsed),
          });
          if (responseStatus !== "incomplete" && attempt < maxSchemaAttempts) {
            lastError = error;
            schemaRetryInstructions = schemaRetryPrompt(request.sourcePhotoIds, diagnostics);
            await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
            continue;
          }
          if (responseStatus !== "incomplete" || attempt >= maxAttempts) {
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

async function requestGrokAnalysisStream(
  request: {
    model: string;
    instructions: string;
    promptText: string;
    imageContents: Array<{ type: string; image_url: string; detail: VisionImageDetail }>;
    maxOutputTokens: number;
    sourcePhotoIds: string[];
    requestId?: string;
    timeoutMs?: number;
    reasoningEffort?: string;
  },
  onProgress?: (event: GrokStreamProgressEvent) => void,
): Promise<MealAnalysis> {
  const apiKey = process.env.XAI_API_KEY || requireServerEnv("XAI_API_KEY");
  const endpoint = process.env.XAI_RESPONSES_URL || "https://api.x.ai/v1/responses";
  const imageCount = request.imageContents.length;
  const payload = {
    model: request.model,
    stream: true,
    store: false,
    prompt_cache_key: mealPromptCacheKey("xai", request.model, 1, true),
    reasoning: { effort: request.reasoningEffort || (request.model.startsWith("grok-4.3") ? "none" : "low") },
    max_output_tokens: request.maxOutputTokens,
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

  const timeoutMs = providerTimeoutMs(imageCount === 0 ? TEXT_PROVIDER_TIMEOUT_MS : DEFAULT_PROVIDER_TIMEOUT_MS, request.timeoutMs);
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const code: MealVisionErrorCode = timeout ? "provider_timeout" : "provider_unavailable";
    throw new MealVisionError(code, providerMessage("xai", code), { cause: error, provider: "xai", requestId: request.requestId, retryable: true });
  }

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
    throw new MealVisionError(code, providerMessage("xai", code), { provider: "xai", status: response.status, requestId: request.requestId, retryable });
  }

  if (!response.body) {
    clearTimeout(timeoutId);
    throw new MealVisionError("provider_empty_response", "xAI stream returned empty body.", { provider: "xai", requestId: request.requestId });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let detectedDish: string | null = null;
  const detectedFoods = new Set<string>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => controller.abort(), 30_000);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.type === "response.reasoning_summary_text.delta" && typeof parsed.delta === "string") {
              onProgress?.({ type: "reasoning", delta: parsed.delta });
            } else if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
              fullText += parsed.delta;
              onProgress?.({ type: "text_delta", delta: parsed.delta });

              if (!detectedDish) {
                const dishMatch = fullText.match(/"dishType"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
                if (dishMatch && dishMatch[1]) {
                  detectedDish = dishMatch[1];
                  onProgress?.({ type: "dish_detected", dishType: detectedDish });
                }
              }

              const foodNameMatches = fullText.matchAll(/"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
              for (const match of foodNameMatches) {
                const name = match[1]?.trim();
                if (name && !detectedFoods.has(name)) {
                  detectedFoods.add(name);
                  onProgress?.({ type: "food_detected", food: name });
                }
              }
            }
          } catch {
            // Ignore partial SSE lines
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (!fullText.trim()) {
    throw new MealVisionError("provider_empty_response", "xAI stream completed without content.", { provider: "xai", requestId: request.requestId });
  }

  const parsedJson = structuredJson(fullText, request.sourcePhotoIds);
  const normalized = normalizeStructuredAnalysis(parsedJson, request.sourcePhotoIds) as MealAnalysis;
  return normalized;
}

export function createXaiMealVisionProvider(options: { maxAttempts?: number; timeoutMs?: number } = {}): MealVisionProvider {
  const model = process.env.XAI_MEAL_VISION_MODEL || "grok-4.6";
  return {
    name: "xai",
    model,
    async analyze(input) {
      return requestGrokAnalysis({
        model,
        instructions: MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "auto" as VisionImageDetail })),
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
    async analyzeStream(input, onProgress) {
      return requestGrokAnalysisStream({
        model,
        instructions: MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "auto" as VisionImageDetail })),
        maxOutputTokens: 6_000,
        sourcePhotoIds: input.images.map((image) => image.id),
        requestId: input.requestId,
        timeoutMs: options.timeoutMs ?? providerTimeoutMs(DEFAULT_PROVIDER_TIMEOUT_MS),
      }, onProgress);
    },
    async analyzeTextStream(input, onProgress) {
      return requestGrokAnalysisStream({
        model,
        instructions: MEAL_TEXT_PROVIDER_INSTRUCTIONS,
        promptText: makeTextPrompt(input),
        imageContents: [],
        maxOutputTokens: 3_000,
        sourcePhotoIds: [],
        requestId: input.requestId,
        timeoutMs: options.timeoutMs ?? providerTimeoutMs(TEXT_PROVIDER_TIMEOUT_MS),
      }, onProgress);
    },
  };
}

function validateProviderResult(value: MealAnalysis, sourcePhotoIds: readonly string[], provider: MealVisionProvider) {
  try {
    const sanitized = normalizeStructuredAnalysis(value, sourcePhotoIds) as MealAnalysis;
    validateMealAnalysis(sanitized, { sourcePhotoIds });
    return sanitized;
  } catch (error) {
    if (error instanceof MealVisionError) throw error;
    throw new MealVisionError(
      "response_schema_error",
      "Le provider a retourné une analyse structurée incohérente (invalid structured meal analysis).",
      { cause: error, provider: provider.name, requestId: undefined, retryable: false },
    );
  }
}

export async function analyzeMealImages(input: MealVisionInput, provider: MealVisionProvider) {
  const result = await provider.analyze(input);
  return { result, provider: provider.name, model: provider.model };
}

export async function analyzeMealText(input: MealVisionTextInput, provider: MealVisionProvider) {
  if (!provider.analyzeText) throw new Error("This meal analysis provider does not support text-only analysis.");
  const result = await provider.analyzeText(input);
  return { result, provider: provider.name, model: provider.model };
}

/**
 * Dispatches one meal analysis according to the available evidence using a single
 * configured vision or text-analysis model without any secondary validator.
 */
export async function analyzeMealInput(input: MealVisionInput, provider: MealVisionProvider, options: { requestId?: string } = {}) {
  const providerInput = options.requestId && !input.requestId ? { ...input, requestId: options.requestId } : input;
  const recipeContext = input.recipeReferences?.length ? { recipeReferences: input.recipeReferences } : {};
  const primaryResponse = input.images.length > 0
    ? await provider.analyze(providerInput)
    : await (async () => {
      const note = input.note?.trim() ?? "";
      if (!note && !input.correction) throw new Error("A meal needs a note, a correction, or at least one image before analysis.");
      if (!provider.analyzeText) throw new Error("This meal analysis provider does not support text-only analysis.");
      return provider.analyzeText({
        mealType: input.mealType,
        mealDate: input.mealDate,
        note: note || (input.correction ? "Mise à jour du repas précédent." : ""),
        ...(input.correction ? { correction: input.correction } : {}),
        ...(input.previousAnalysis ? { previousAnalysis: input.previousAnalysis } : {}),
        ...(providerInput.retryHint ? { retryHint: providerInput.retryHint } : {}),
        ...(providerInput.requestId ? { requestId: providerInput.requestId } : {}),
        ...recipeContext,
      });
    })();
  const sourcePhotoIds = input.images.map((image) => image.id);
  const result = validateProviderResult(primaryResponse, sourcePhotoIds, provider);
  const validation = {
    requested: false,
    configured: false,
    attempted: false,
    succeeded: false,
    provider: null,
    model: null,
  };
  return { result, provider: provider.name, model: provider.model, validation };
}

export async function analyzeMealInputStream(
  input: MealVisionInput,
  provider: MealVisionProvider,
  options: { requestId?: string } = {},
  onProgress?: (event: GrokStreamProgressEvent) => void,
) {
  const providerInput = options.requestId && !input.requestId ? { ...input, requestId: options.requestId } : input;
  const recipeContext = input.recipeReferences?.length ? { recipeReferences: input.recipeReferences } : {};
  let primaryResponse: MealAnalysis;
  if (input.images.length > 0) {
    if (provider.analyzeStream) {
      primaryResponse = await provider.analyzeStream(providerInput, onProgress);
    } else {
      primaryResponse = await provider.analyze(providerInput);
    }
  } else {
    const note = input.note?.trim() ?? "";
    if (!note && !input.correction) throw new Error("A meal needs a note, a correction, or at least one image before analysis.");
    const textInput = {
      mealType: input.mealType,
      mealDate: input.mealDate,
      note: note || (input.correction ? "Mise à jour du repas précédent." : ""),
      ...(input.correction ? { correction: input.correction } : {}),
      ...(input.previousAnalysis ? { previousAnalysis: input.previousAnalysis } : {}),
      ...(providerInput.retryHint ? { retryHint: providerInput.retryHint } : {}),
      ...(providerInput.requestId ? { requestId: providerInput.requestId } : {}),
      ...recipeContext,
    };
    if (provider.analyzeTextStream) {
      primaryResponse = await provider.analyzeTextStream(textInput, onProgress);
    } else if (provider.analyzeText) {
      primaryResponse = await provider.analyzeText(textInput);
    } else {
      throw new Error("This meal analysis provider does not support text-only analysis.");
    }
  }
  const sourcePhotoIds = input.images.map((image) => image.id);
  const result = validateProviderResult(primaryResponse, sourcePhotoIds, provider);
  const validation = {
    requested: false,
    configured: false,
    attempted: false,
    succeeded: false,
    provider: null,
    model: null,
  };
  return { result, provider: provider.name, model: provider.model, validation };
}
