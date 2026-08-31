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

export type MealVisionProvider = {
  name: string;
  model: string;
  analyze(input: MealVisionInput): Promise<MealAnalysis>;
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
    required: ["name", "preparation", "portion", "estimatedGrams", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "confidence"],
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
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "foods", "totals", "confidence", "uncertainties"],
    properties: {
      summary: { type: "string", maxLength: 800 },
      foods: { type: "array", maxItems: 30, items: food },
      totals: {
        type: "object",
        additionalProperties: false,
        required: ["calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams"],
        properties: {
          calories: range,
          proteinGrams: range,
          carbohydrateGrams: range,
          fatGrams: range,
          fiberGrams: range,
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

function makePrompt(input: MealVisionInput) {
  const origins = input.images.map((image, index) => `Photo ${index + 1} source: ${image.origin}`).join("\n");
  return [
    "Analyse these photos as one meal for a personal food journal.",
    "Identify only foods and drinks that are visible or strongly supported by the images. Do not count the same food twice when photos show different angles.",
    "Estimate portion sizes and nutrition as ranges, not false precision. For every non-null range provide low, likely, and high values with low <= likely <= high. Use null when a nutrient cannot be estimated responsibly.",
    "Include the main preparation (for example grilled, fried, raw, or with sauce) only when visible or stated.",
    "Return a concise summary, itemized foods, total calories and macros, confidence, and concrete uncertainties.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    origins,
  ].join("\n");
}

export function createXaiMealVisionProvider(): MealVisionProvider {
  const model = process.env.XAI_MEAL_VISION_MODEL || "grok-4.6";
  return {
    name: "xai",
    model,
    async analyze(input) {
      const apiKey = requireServerEnv("XAI_API_KEY");
      const response = await fetch(process.env.XAI_RESPONSES_URL || "https://api.x.ai/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 2_200,
          instructions: "You are a careful food-photo analyst. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Use ranges and nulls as requested. Return only the requested JSON object.",
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: makePrompt(input) },
              ...input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" })),
            ],
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
      if (!response.ok) throw new Error(`Grok meal analysis failed with status ${response.status}.`);
      const text = responseText(await response.json());
      if (!text) throw new Error("Grok returned no structured meal analysis.");
      try {
        return mealAnalysisSchema.parse(JSON.parse(text));
      } catch {
        throw new Error("Grok returned an invalid structured meal analysis.");
      }
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
