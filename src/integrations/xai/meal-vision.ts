import "server-only";

import type { MealAnalysis } from "@/domain/meals";

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  TEXT_PROVIDER_TIMEOUT_MS,
  imageDataUri,
  providerTimeoutMs,
  requestGrokAnalysis,
  requestGrokAnalysisStream,
  requestStructuredMealAnalysis,
} from "./meal-vision-client";
import {
  MEAL_ANALYSIS_PROMPT_VERSION,
  MEAL_ANALYSIS_SCHEMA_VERSION,
  MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
  MEAL_TEXT_PROVIDER_INSTRUCTIONS,
  makePrompt,
  makeTextPrompt,
} from "./meal-vision-prompts";
import { mealAnalysisJsonSchema } from "./meal-vision-schema";
import { normalizeStructuredAnalysis, validateProviderResult } from "./meal-vision-parser";
import {
  MealVisionError,
  isXaiVisionMimeType,
  type GrokStreamProgressEvent,
  type MealVisionErrorCode,
  type MealVisionImage,
  type MealVisionInput,
  type MealVisionProvider,
  type MealVisionTextInput,
  type MealVisionVerificationInput,
  type VisionImageDetail,
} from "./meal-vision-types";

// Keep the original module as the stable public entry point for the XAI
// integration. Implementation details live in focused sibling modules.
export {
  imageDataUri,
  requestStructuredMealAnalysis,
  MEAL_ANALYSIS_PROMPT_VERSION,
  MEAL_ANALYSIS_SCHEMA_VERSION,
  MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
  MEAL_TEXT_PROVIDER_INSTRUCTIONS,
  makePrompt,
  makeTextPrompt,
  mealAnalysisJsonSchema,
  normalizeStructuredAnalysis,
  MealVisionError,
  isXaiVisionMimeType,
};
export type {
  GrokStreamProgressEvent,
  MealVisionErrorCode,
  MealVisionImage,
  MealVisionInput,
  MealVisionProvider,
  MealVisionTextInput,
  MealVisionVerificationInput,
  VisionImageDetail,
};

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
