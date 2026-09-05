import "server-only";

import { mealAnalysisSchema, type MealAnalysis, type MealOrigin, type MealType } from "@/domain/meals";
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
};

export type MealVisionTextInput = {
  mealType: MealType;
  mealDate: string;
  note: string;
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
};

/** xAI image understanding currently accepts JPEG/JPG and PNG input. */
export function isXaiVisionMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/png";
}

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
    required: ["name", "preparation", "portion", "estimatedGrams", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sugarGrams", "addedSugarGrams", "confidence"],
    properties: {
      name: { type: "string", maxLength: 120 },
      preparation: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] },
      portion: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
      estimatedGrams: { anyOf: [{ type: "number", minimum: 0, maximum: 10000 }, { type: "null" }] },
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

export function makeTextPrompt(input: MealVisionTextInput) {
  return [
    "Analyse cette description libre d'un repas pour un journal alimentaire personnel. Réponds avec des libellés en français.",
    "Liste chaque aliment cité dans la description. Indique une quantité ou une portion seulement si l'utilisateur la donne explicitement (par exemple « 2 bananes ») ; sinon portion à null. Ne jamais inventer de grammes : estimatedGrams à null si la description ne permet pas une estimation responsable.",
    "Estime la nutrition en fourchettes larges, pas en fausse précision. Pour chaque fourchette non-nulle, fournis low, likely et high avec low <= likely <= high. Utilise null quand un nutriment ne peut pas être estimé de façon responsable.",
    "Estime séparément les sucres totaux et les sucres ajoutés lorsque la description le permet. Ne confonds jamais glucides et sucres ; utilise null si ce n’est pas estimable. Inclus sugarGrams et addedSugarGrams pour chaque aliment et dans totals.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "confidence à low par défaut, sauf si la description est très précise (aliments, quantités et préparation explicites).",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    `User description: ${input.note}`,
  ].join("\n");
}

function makePrompt(input: MealVisionInput) {
  const origins = input.images.map((image, index) => `Photo ${index + 1} source: ${image.origin}`).join("\n");
  return [
    "Analyse these photos as one meal for a personal food journal. Réponds avec des libellés en français.",
    "Identify only foods and drinks that are visible or strongly supported by the images. Do not count the same food twice when photos show different angles. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support.",
    "dishType : nom du type de plat en français en 2-4 mots (par exemple « Salade composée », « Bowl de riz au poulet »), ou null si indéterminable (unclear).",
    "Pour chaque aliment : name en français ; portion/quantityLabel en français seulement si visuellement estimable (par exemple « 1 bol », « 2 tranches »), sinon null ; ne jamais deviner les grammes : estimatedGrams à null si non estimable.",
    "Estimate portion sizes and nutrition as ranges, not false precision. For every non-null range provide low, likely, and high values with low <= likely <= high. Use null when a nutrient cannot be estimated responsibly.",
    "Estimate total sugars and added sugars separately when the food or preparation supports it. Use null rather than guessing, and never treat all carbohydrates as sugar. Include sugarGrams and addedSugarGrams for every food and in totals.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "Include the main preparation (for example grilled, fried, raw, or with sauce) only when visible or stated.",
    "Return a concise summary, itemized foods, total calories and macros, confidence, and concrete uncertainties.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    origins,
  ].join("\n");
}

async function requestGrokAnalysis({ model, instructions, promptText, imageContents, maxOutputTokens }: {
  model: string;
  instructions: string;
  promptText: string;
  imageContents: Array<{ type: string; image_url: string; detail: string }>;
  maxOutputTokens: number;
}) {
  let response: Response;
  try {
    const apiKey = requireServerEnv("XAI_API_KEY");
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
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
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

export function createXaiMealVisionProvider(): MealVisionProvider {
  const model = process.env.XAI_MEAL_VISION_MODEL || "grok-4.6";
  return {
    name: "xai",
    model,
    async analyze(input) {
      return requestGrokAnalysis({
        model,
        instructions: "You are a careful food-photo analyst. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Use ranges with low <= likely <= high and nulls when not estimable. Labels in French. Return only the requested JSON object.",
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" })),
        maxOutputTokens: 4_000,
      });
    },
    async analyzeText(input) {
      return requestGrokAnalysis({
        model,
        instructions: "You are a careful food-description analyst. List only foods named in the user description. Never invent exact grams or nutrition precision the description cannot support; use wide ranges with low <= likely <= high and nulls when not estimable. Default confidence to low unless the description is very precise. Always include 'Estimation à partir de la seule description, sans photo.' in uncertainties. Labels in French. Return only the requested JSON object.",
        promptText: makeTextPrompt(input),
        imageContents: [],
        maxOutputTokens: 1_500,
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
 * provider's text-only method.
 */
export async function analyzeMealInput(input: MealVisionInput, provider: MealVisionProvider = getMealVisionProvider()) {
  if (input.images.length > 0) return analyzeMealImages(input, provider);
  const note = input.note?.trim() ?? "";
  if (!note) throw new Error("A meal needs a note or at least one image before analysis.");
  return analyzeMealText({ mealType: input.mealType, mealDate: input.mealDate, note }, provider);
}
