import "server-only";

import { createHash } from "node:crypto";

import { validateMealAnalysis, type MealAnalysis } from "@/domain/meals";
import { requireServerEnv } from "@/lib/env";

import {
  MEAL_ANALYSIS_PROMPT_VERSION,
  MEAL_ANALYSIS_SCHEMA_VERSION,
} from "./meal-vision-prompts";
import { mealAnalysisJsonSchema } from "./meal-vision-schema";
import {
  normalizeStructuredAnalysis,
  responseDiagnostics,
  responseText,
  safeSchemaDiagnostics,
  schemaRetryPrompt,
  structuredJson,
} from "./meal-vision-parser";
import {
  MealVisionError,
  type GrokStreamProgressEvent,
  type MealVisionErrorCode,
  type MealVisionImage,
  type VisionImageDetail,
} from "./meal-vision-types";

const MAX_PROVIDER_ATTEMPTS = 2;
// Leave eight seconds in the 60-second worker for photo I/O and persistence.
// A real three-photo request crossed the former 45-second cap.
export const DEFAULT_PROVIDER_TIMEOUT_MS = 52_000;
const MAX_PROVIDER_TIMEOUT_MS = 52_000;
export const TEXT_PROVIDER_TIMEOUT_MS = 52_000;

export function providerTimeoutMs(fallback: number, requested?: number) {
  const configured = requested ?? Number(process.env.MEAL_ANALYSIS_PROVIDER_TIMEOUT_MS || fallback);
  return Number.isFinite(configured)
    ? Math.min(MAX_PROVIDER_TIMEOUT_MS, Math.max(1_000, configured))
    : fallback;
}

/** A stable, versioned cache identifier that stays under OpenAI's 64-character limit. */
function mealPromptCacheKey(provider: string, model: string, attempt: number, stream = false) {
  const fingerprint = createHash("sha256")
    .update([MEAL_ANALYSIS_PROMPT_VERSION, MEAL_ANALYSIS_SCHEMA_VERSION, provider, model, attempt, stream].join(":"))
    .digest("hex")
    .slice(0, 24);
  return `soma-meal-${fingerprint}`;
}

export function imageDataUri(image: MealVisionImage) {
  return `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`;
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

export type StructuredRequest = {
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
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
        provider: request.provider,
        model: request.model,
        stage: "provider_request",
        attempt,
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
        provider: request.provider,
        model: request.model,
        stage: "provider_response",
        attempt,
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
        provider: request.provider,
        model: request.model,
        stage: "response_decode",
        attempt,
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
            provider: request.provider,
            model: request.model,
            stage: "response_parse",
            attempt,
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
            provider: request.provider,
            model: request.model,
            stage: "provider_success",
            attempt,
            durationMs,
          });
          return result;
        } catch (error) {
          const diagnostics = safeSchemaDiagnostics(error);
          console.error("[meal-analysis] provider content failed schema validation", {
            provider: request.provider,
            model: request.model,
            stage: "response_schema",
            attempt,
            durationMs,
            code: "response_schema_error",
            schemaIssues: diagnostics,
          });
          if (responseStatus !== "incomplete" && attempt < maxAttempts) {
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
        provider: request.provider,
        model: request.model,
        stage: "response_incomplete",
        attempt,
        durationMs,
        reason: outputLimitReached ? "output_limit" : "other",
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
        provider: request.provider,
        model: request.model,
        stage: "response_empty",
        attempt,
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

export async function requestGrokAnalysis({ model, instructions, promptText, imageContents, maxOutputTokens, sourcePhotoIds, requestId, maxAttempts, timeoutMs }: {
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

export async function requestGrokAnalysisStream(
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
