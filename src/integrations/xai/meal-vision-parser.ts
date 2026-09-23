import { validateMealAnalysis, type MealAnalysis } from "@/domain/meals";
import { z } from "zod";

import { photoAlias } from "./meal-vision-prompts";
import { MealVisionError, type MealVisionProvider } from "./meal-vision-types";

/** Extract only assistant text blocks from Responses and compatible payloads. */
export function responseText(result: unknown) {
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

/** Return only numeric usage counters safe for telemetry. */
export function responseDiagnostics(result: unknown) {
  if (!result || typeof result !== "object") return {};
  const response = result as { usage?: unknown };
  const usage = response.usage && typeof response.usage === "object"
    ? response.usage as { output_tokens?: unknown; output_tokens_details?: unknown }
    : null;
  const outputDetails = usage?.output_tokens_details && typeof usage.output_tokens_details === "object"
    ? usage.output_tokens_details as { reasoning_tokens?: unknown }
    : null;
  return {
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined,
    reasoningTokens: typeof outputDetails?.reasoning_tokens === "number" ? outputDetails.reasoning_tokens : undefined,
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

export function structuredJson(text: string, sourcePhotoIds?: readonly string[]) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [fenced, trimmed, ...balancedJsonCandidates(trimmed)].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return normalizeStructuredAnalysis(JSON.parse(candidate) as unknown, sourcePhotoIds);
    } catch (error) {
      lastError = error;
    }
  }
  throw new MealVisionError("response_parse_error", "La réponse du provider n’est pas un JSON valide.", { cause: lastError });
}

type SafeSchemaDiagnostic = { path: string; code: string };

/** Keep schema telemetry useful without logging model output, values, or secrets. */
export function safeSchemaDiagnostics(error: unknown): SafeSchemaDiagnostic[] {
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

export function schemaRetryPrompt(sourcePhotoIds: readonly string[] | undefined, diagnostics: SafeSchemaDiagnostic[]) {
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

export function validateProviderResult(value: MealAnalysis, sourcePhotoIds: readonly string[], provider: MealVisionProvider) {
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
