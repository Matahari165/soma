import "server-only";

import type { MealRecipeReference } from "@/domain/meal-recipes";
import { mealAnalysisSchema, type MealAnalysis, type MealAnalysisCorrection, type MealOrigin, type MealType } from "@/domain/meals";
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
  recipeReferences?: MealRecipeReference[];
};

export type MealVisionTextInput = {
  mealType: MealType;
  mealDate: string;
  note: string;
  correction?: MealAnalysisCorrection | null;
  recipeReferences?: MealRecipeReference[];
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
  | "provider_unavailable"
  | "invalid_response";

export class MealVisionError extends Error {
  constructor(readonly code: MealVisionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MealVisionError";
  }
}

export type MealVisionProvider = {
  name: string;
  model: string;
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

// Meal analysis is allowed to spend more time on the primary vision pass than
// on the optional validator. Four photos can take longer to inspect than one,
// while the route still has to finish well inside its 50s platform budget.
const PRIMARY_VISION_TIMEOUT_MS = 30_000;
const TEXT_ANALYSIS_TIMEOUT_MS = 15_000;
const VALIDATOR_TIMEOUT_MS = 12_000;

type VisionImageDetail = "low" | "high";

function imageDataUri(image: MealVisionImage) {
  return `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`;
}

function mealAnalysisJsonSchema() {
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
    required: ["name", "preparation", "portion", "estimatedGrams", "kind", "parentId", "course", "countedInTotals", "foodGroups", "varietyKey", "evidence", "evidenceSource", "evidencePhotoIds", "quantity", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "addedSugarGrams", "confidence"],
    properties: {
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
      evidence: { type: "string", enum: ["visible", "inferred", "unknown"] },
      evidenceSource: { type: "string", enum: ["photo", "note", "model"] },
      evidencePhotoIds: { type: "array", maxItems: 5, items: { type: "string", minLength: 1, maxLength: 120 } },
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
    required: ["summary", "dishType", "calorieAnalysis", "foods", "totals", "confidence", "uncertainties"],
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
    },
  };
}

function responseText(result: unknown) {
  const output = (result as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const fragments = output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const typed = part as { type?: unknown; text?: unknown };
      return typed.type === "output_text" && typeof typed.text === "string" ? [typed.text] : [];
    });
  });
  return fragments.join("\n") || null;
}

function recipeReferencesPrompt(recipeReferences: MealRecipeReference[] | undefined) {
  if (!recipeReferences?.length) return "Aucune recette personnelle pertinente n'a été fournie.";
  return [
    "Références personnelles facultatives : elles décrivent des recettes récurrentes, mais leurs ingrédients et quantités sont variables et indicatifs.",
    "Utilise-les seulement comme hypothèses de contexte. La photo et la description actuelles priment. Ne copie jamais un ingrédient, une préparation ou une quantité qui n'est pas visible ou explicitement décrit aujourd'hui. Si une référence contredit les preuves actuelles, ignore-la et conserve une incertitude.",
    `Personal recipe references (context only): ${JSON.stringify(recipeReferences)}`,
  ].join("\n");
}

export function makeTextPrompt(input: MealVisionTextInput) {
  return [
    "Analyse cette description libre d'un repas pour un journal alimentaire personnel. Réponds avec des libellés en français.",
    "Liste chaque aliment cité dans la description. Indique une quantité ou une portion seulement si l'utilisateur la donne explicitement (par exemple « 2 bananes ») ; sinon portion à null. Ne jamais inventer de grammes : estimatedGrams à null si la description ne permet pas une estimation responsable.",
    "Pour un plat composé, distingue le plat, ses composants et les ingrédients seulement si cela évite une ambiguïté. Ne double jamais un plat avec ses composants : countedInTotals doit être false pour le parent si ses composants sont comptés.",
    "Pour chaque aliment, renseigne course avec starter, main, side ou dessert seulement si la description indique clairement sa place dans le repas ; utilise null sinon. course sert uniquement à structurer l'affichage (entrée, plat, accompagnement, dessert), pas à juger l'aliment.",
    "Pour chaque aliment, renseigne foodGroups avec les grandes familles alimentaires justifiées par la description. Renseigne varietyKey avec un nom canonique court en français pour reconnaître le même aliment dans le temps (par exemple « tomate », « poulet », « riz »), ou null si l'identité est trop incertaine. Ces champs décrivent la composition ; ils ne constituent pas un jugement de qualité.",
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme éléments inferred/unknown structurés quand elles sont pertinentes, sans en inventer la quantité. Utilise kind, parentId, evidence, evidenceSource et quantity seulement quand ils sont justifiés.",
    "Estime la nutrition en fourchettes larges, pas en fausse précision. Pour chaque fourchette non-nulle, fournis low, likely et high avec low <= likely <= high. Utilise null quand un nutriment ne peut pas être estimé de façon responsable.",
    "Estime séparément les sucres totaux et les sucres ajoutés lorsque la description le permet. Ne confonds jamais glucides et sucres ; utilise null si ce n’est pas estimable. Inclus sugarGrams et addedSugarGrams pour chaque aliment et dans totals.",
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Ne fabrique aucune quantité : quantity et estimatedGrams restent null quand la description ne permet pas une estimation responsable.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "confidence à low par défaut, sauf si la description est très précise (aliments, quantités et préparation explicites).",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    `User description: ${input.note}`,
    input.correction ? `User correction to apply: ${input.correction}` : "No user correction was supplied.",
    recipeReferencesPrompt(input.recipeReferences),
  ].join("\n");
}

function makePrompt(input: MealVisionInput) {
  const origins = input.images.map((image, index) => `Photo ${index + 1} id: ${image.id} source: ${image.origin}`).join("\n");
  return [
    "Analyse these photos as one meal for a personal food journal. Réponds avec des libellés en français.",
    "Identify only foods and drinks that are visible or strongly supported by the images. Do not count the same food twice when photos show different angles. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support.",
    "dishType : nom du type de plat en français en 2-4 mots (par exemple « Salade composée », « Bowl de riz au poulet »), ou null si indéterminable (unclear).",
    "Pour chaque aliment : name en français ; portion/quantityLabel en français seulement si visuellement estimable (par exemple « 1 bol », « 2 tranches »), sinon null ; ne jamais deviner les grammes : estimatedGrams à null si non estimable.",
    "Pour un plat composé, utilise kind=dish pour le plat et kind=component ou ingredient pour ses éléments seulement si cela clarifie ce qui est visible. Ne double jamais le plat avec ses composants : si les composants sont comptés dans les totaux, countedInTotals=false pour le plat parent et parentId pour chaque enfant.",
    "Pour chaque aliment, renseigne course avec starter, main, side ou dessert seulement si sa place est justifiée par la note ou une preuve claire ; utilise null sinon. course sert uniquement à structurer l'affichage (entrée, plat, accompagnement, dessert), pas à juger l'aliment.",
    "Pour chaque aliment, renseigne foodGroups avec les grandes familles alimentaires visibles ou fortement inférées. Renseigne varietyKey avec un nom canonique court en français pour reconnaître le même aliment dans le temps (par exemple « tomate », « poulet », « riz »), ou null si l'identité est trop incertaine. Ces champs décrivent la composition ; ils ne constituent pas un jugement de qualité.",
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme aliments structurés avec evidence=inferred ou evidence=unknown et evidenceSource=photo, note ou model selon la preuve. Si une photo justifie l'aliment, reporte son identifiant dans evidencePhotoIds. Ne les invente pas et ne fabrique aucune quantité ; quantity.value, quantity.grams et estimatedGrams restent null lorsque la photo ne permet pas de les estimer.",
    "Estimate portion sizes and nutrition as ranges, not false precision. For every non-null range provide low, likely, and high values with low <= likely <= high. Use null when a nutrient cannot be estimated responsibly.",
    "Estimate total sugars and added sugars separately when the food or preparation supports it. Use null rather than guessing, and never treat all carbohydrates as sugar. Include sugarGrams and addedSugarGrams for every food and in totals.",
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Les champs de confiance et d'incertitude sont internes au contrat, pas une consigne d'affichage.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "Include the main preparation (for example grilled, fried, raw, or with sauce) only when visible or stated.",
    "Return a concise summary, itemized foods, total calories and macros, confidence, and concrete uncertainties.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    input.correction ? `User correction to apply: ${input.correction}` : "No user correction was supplied.",
    recipeReferencesPrompt(input.recipeReferences),
    origins,
  ].join("\n");
}

function makeVerificationPrompt(input: MealVisionVerificationInput) {
  return [
    "Relis cette analyse primaire d'un repas avec bienveillance et précision pour un journal alimentaire personnel. Réponds avec des libellés en français.",
    "Vérifie les quantités, les plats composés, les doublons entre un plat et ses composants, les sauces/préparations plausibles, les foodGroups, les varietyKey et la cohérence nutritionnelle avec les photos et la note. Corrige seulement lorsqu'une preuve visuelle, textuelle ou une contradiction forte le justifie ; sinon conserve l'analyse primaire.",
    "Ne fabrique jamais une quantité, un ingrédient caché ou une précision nutritionnelle. Les traces plausibles de sauce ou d'huile peuvent rester structurées en inferred/unknown avec leur source. Si une photo justifie l'aliment, conserve son identifiant dans evidencePhotoIds. Ne double jamais un plat avec ses composants : countedInTotals=false pour le parent lorsque les composants sont comptés.",
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Les champs confidence et uncertainties restent internes à l'analyse.",
    "Une correction utilisateur éventuelle est une indication en langage naturel, à appliquer seulement si elle est compatible avec les preuves.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    input.correction ? `User correction to apply: ${input.correction}` : "No user correction was supplied.",
    recipeReferencesPrompt(input.recipeReferences),
    `Primary analysis: ${JSON.stringify(input.primaryAnalysis)}`,
    input.images.length > 0 ? originsForVerification(input) : "No photo was supplied; verify only against the description and the primary analysis.",
  ].join("\n");
}

function originsForVerification(input: MealVisionVerificationInput) {
  return input.images.map((image, index) => `Photo ${index + 1} id: ${image.id} source: ${image.origin}`).join("\n");
}

async function requestGrokAnalysis({ model, instructions, promptText, imageContents, maxOutputTokens, timeoutMs }: {
  model: string;
  instructions: string;
  promptText: string;
  imageContents: Array<{ type: string; image_url: string; detail: string }>;
  maxOutputTokens: number;
  timeoutMs: number;
}) {
  const imageCount = imageContents.length;
  let apiKey: string;
  try {
    apiKey = requireServerEnv("XAI_API_KEY");
  } catch (error) {
    throw new MealVisionError("provider_auth", "La configuration de l’analyse Grok est invalide.", { cause: error });
  }
  let response: Response;
  try {
    response = await fetch(process.env.XAI_RESPONSES_URL || "https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: maxOutputTokens,
        instructions,
        input: [{
          role: "user",
          content: [{ type: "input_text", text: promptText }, ...imageContents],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "soma_meal_analysis",
            strict: true,
            schema: mealAnalysisJsonSchema(),
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.error("[meal-vision] xAI request failed", {
      model,
      imageCount,
      timeoutMs,
      reason: error instanceof Error ? error.name : "unknown",
    });
    throw new MealVisionError("provider_unavailable", "Grok est momentanément indisponible.", { cause: error });
  }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? "provider_auth"
      : response.status === 429
        ? "provider_rate_limited"
        : response.status >= 500
          ? "provider_unavailable"
          : "provider_request";
    const message = code === "provider_auth"
      ? "La configuration de l’analyse Grok est invalide."
      : code === "provider_rate_limited"
        ? "Grok est momentanément sollicité. Réessaie dans quelques instants."
        : code === "provider_request"
          ? "La demande d’analyse Grok est invalide."
          : "Grok est momentanément indisponible.";
    console.error("[meal-vision] xAI returned an error", { model, imageCount, status: response.status, code });
    throw new MealVisionError(code, message);
  }
  let text: string | null;
  try {
    text = responseText(await response.json());
  } catch (error) {
    throw new MealVisionError("invalid_response", "La réponse de Grok est illisible.", { cause: error });
  }
  if (!text) throw new MealVisionError("invalid_response", "Grok n’a pas retourné d’analyse structurée.");
  try {
    return mealAnalysisSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new MealVisionError("invalid_response", "Grok a retourné une analyse structurée invalide (invalid structured meal analysis).", { cause: error });
  }
}

async function requestOpenAiMealValidation(input: MealVisionVerificationInput, model: string) {
  const imageCount = input.images.length;
  let apiKey: string;
  try {
    apiKey = requireServerEnv("OPENAI_API_KEY");
  } catch (error) {
    throw new MealVisionError("provider_auth", "La configuration du validateur OpenAI est invalide.", { cause: error });
  }
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT || "low" },
        max_output_tokens: 4_000,
        instructions: "Tu es un validateur attentif d'analyses de repas. Relis l'analyse primaire à partir des preuves disponibles, vérifie quantités, plats composés, doublons, sauces/préparations et nutrition, puis corrige uniquement si les preuves le justifient. Ne fabrique jamais de quantité ou de précision. Respecte les fourchettes low <= likely <= high, les relations addedSugar <= sugar <= carbohydrates quand elles sont connues et les nulls quand une donnée ne peut pas être estimée. Les libellés sont en français. Retourne uniquement l'objet JSON demandé.",
        input: [{
          role: "user",
          // The primary Grok pass keeps the detailed images. The validator only
          // needs enough resolution to challenge obvious visual mistakes, which
          // keeps this second request lighter without removing the evidence.
          content: [{ type: "input_text", text: makeVerificationPrompt(input) }, ...input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "low" }))],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "soma_meal_analysis",
            strict: true,
            schema: mealAnalysisJsonSchema(),
          },
        },
      }),
      signal: AbortSignal.timeout(VALIDATOR_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[meal-vision] OpenAI validator request failed", {
      model,
      imageCount,
      timeoutMs: VALIDATOR_TIMEOUT_MS,
      reason: error instanceof Error ? error.name : "unknown",
    });
    throw new MealVisionError("provider_unavailable", "Le validateur OpenAI est momentanément indisponible.", { cause: error });
  }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? "provider_auth"
      : response.status === 429
        ? "provider_rate_limited"
        : response.status >= 500
          ? "provider_unavailable"
          : "provider_request";
    const message = code === "provider_auth"
      ? "La configuration du validateur OpenAI est invalide."
      : code === "provider_rate_limited"
        ? "OpenAI est momentanément sollicité."
        : code === "provider_request"
          ? "La demande du validateur OpenAI est invalide."
          : "Le validateur OpenAI est momentanément indisponible.";
    console.error("[meal-vision] OpenAI validator returned an error", { model, imageCount, status: response.status, code });
    throw new MealVisionError(code, message);
  }
  let text: string | null;
  try {
    text = responseText(await response.json());
  } catch (error) {
    throw new MealVisionError("invalid_response", "La réponse du validateur OpenAI est illisible.", { cause: error });
  }
  if (!text) throw new MealVisionError("invalid_response", "Le validateur OpenAI n’a pas retourné d’analyse structurée.");
  try {
    return mealAnalysisSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new MealVisionError("invalid_response", "Le validateur OpenAI a retourné une analyse structurée invalide.", { cause: error });
  }
}

export function createXaiMealVisionProvider(): MealVisionProvider {
  const model = process.env.XAI_MEAL_VISION_MODEL || "grok-4.6";
  const xaiValidatorModel = process.env.XAI_MEAL_VALIDATOR_MODEL || model;
  const openAiValidatorModel = process.env.OPENAI_MEAL_VALIDATOR_MODEL || "gpt-5.6-sol";
  return {
    name: "xai",
    model,
    async analyze(input) {
      return requestGrokAnalysis({
        model,
        instructions: "You are a careful food-photo analyst. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Use ranges with low <= likely <= high and nulls when not estimable. Labels in French. Return only the requested JSON object.",
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" as VisionImageDetail })),
        maxOutputTokens: 4_000,
        timeoutMs: PRIMARY_VISION_TIMEOUT_MS,
      });
    },
    async analyzeText(input) {
      return requestGrokAnalysis({
        model,
        instructions: "You are a careful food-description analyst. List only foods named in the user description. Never invent exact grams or nutrition precision the description cannot support; use wide ranges with low <= likely <= high and nulls when not estimable. Default confidence to low unless the description is very precise. Always include 'Estimation à partir de la seule description, sans photo.' in uncertainties. Labels in French. Return only the requested JSON object.",
        promptText: makeTextPrompt(input),
        imageContents: [],
        maxOutputTokens: 1_500,
        timeoutMs: TEXT_ANALYSIS_TIMEOUT_MS,
      });
    },
    async verify(input) {
      if (process.env.OPENAI_API_KEY) return requestOpenAiMealValidation(input, openAiValidatorModel);
      return requestGrokAnalysis({
        model: xaiValidatorModel,
        instructions: "Tu es un vérificateur attentif d'analyses de repas. Relis l'analyse primaire à partir des preuves disponibles, vérifie quantités, plats composés, doublons, sauces/préparations et nutrition, puis corrige uniquement si les preuves le justifient. Ne fabrique jamais de quantité ou de précision. Respecte les fourchettes low <= likely <= high, les relations addedSugar <= sugar <= carbohydrates quand elles sont connues et les nulls quand une donnée ne peut pas être estimée. Les libellés sont en français. Retourne uniquement l'objet JSON demandé.",
        promptText: makeVerificationPrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" as VisionImageDetail })),
        maxOutputTokens: 4_000,
        timeoutMs: VALIDATOR_TIMEOUT_MS,
      });
    },
  };
}

export function getMealVisionProvider(): MealVisionProvider {
  return createXaiMealVisionProvider();
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
export async function analyzeMealInput(input: MealVisionInput, provider: MealVisionProvider = getMealVisionProvider(), options: { verify?: boolean } = {}) {
  const recipeContext = input.recipeReferences?.length ? { recipeReferences: input.recipeReferences } : {};
  const primary = input.images.length > 0
    ? await provider.analyze(input)
    : await (async () => {
      const note = input.note?.trim() ?? "";
      if (!note) throw new Error("A meal needs a note or at least one image before analysis.");
      if (!provider.analyzeText) throw new Error("This meal analysis provider does not support text-only analysis.");
      return provider.analyzeText({
        mealType: input.mealType,
        mealDate: input.mealDate,
        note,
        ...(input.correction ? { correction: input.correction } : {}),
        ...recipeContext,
      });
    })();

  let result = primary;
  if (options.verify !== false && provider.verify) {
    try {
      result = await provider.verify({ ...input, primaryAnalysis: primary });
    } catch {
      // The primary analysis is still useful when the optional verification pass fails.
      result = primary;
    }
  }
  return { result, provider: provider.name, model: provider.model };
}
