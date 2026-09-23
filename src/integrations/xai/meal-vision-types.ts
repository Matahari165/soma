import type { MealRecipeReference } from "@/domain/meal-recipes";
import type {
  MealAnalysis,
  MealAnalysisCorrection,
  MealOrigin,
  MealType,
} from "@/domain/meals";

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

export type VisionImageDetail = "low" | "high" | "auto";

/** xAI image understanding currently accepts JPEG/JPG and PNG input. */
export function isXaiVisionMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/png";
}
