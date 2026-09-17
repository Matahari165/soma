export type MealRequestOperation = "load" | "create" | "update" | "upload" | "analyze";
export type MealClientErrorCode = "network" | "timeout" | "unknown";

export const MEAL_ANALYSIS_REQUEST_TIMEOUT_MS = 15_000;
export const MEAL_ANALYSIS_STATUS_TIMEOUT_MS = 10_000;

const operationMessages: Record<MealRequestOperation, { timeout: string; network: string }> = {
  load: {
    timeout: "Loading meals took too long. Please try again.",
    network: "Connection to Soma was interrupted while loading meals.",
  },
  create: {
    timeout: "Creating the meal took too long. Please try again.",
    network: "Connection to Soma was interrupted while creating the meal.",
  },
  update: {
    timeout: "Updating the meal took too long. Please try again.",
    network: "Connection to Soma was interrupted while updating the meal.",
  },
  upload: {
    timeout: "Uploading photos took too long. Check your connection and try again.",
    network: "Connection to Soma was interrupted while uploading photos.",
  },
  analyze: {
    timeout: "Analysis is taking longer than expected. Please try again in a few moments.",
    network: "Connection to Soma was interrupted during analysis. Please try again.",
  },
};

export class MealClientError extends Error {
  constructor(
    message: string,
    readonly code: MealClientErrorCode,
    readonly operation: MealRequestOperation,
    readonly requestId?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MealClientError";
  }
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown client error";
}

export function classifyMealClientError(error: unknown, operation: MealRequestOperation, requestId?: string) {
  if (error instanceof MealClientError) return error;
  const name = errorName(error);
  const message = errorMessage(error);
  const timeout = name === "AbortError" || name === "TimeoutError";
  const network = /failed to fetch|network|load failed/i.test(message) || (name === "TypeError" && /fetch|network|load/i.test(message));
  const code: MealClientErrorCode = timeout ? "timeout" : network ? "network" : "unknown";
  const safeMessage = code === "timeout"
    ? operationMessages[operation].timeout
    : code === "network"
      ? operationMessages[operation].network
      : message || "The Soma request did not succeed. Please try again.";
  return new MealClientError(safeMessage, code, operation, requestId, { cause: error });
}

async function requestMeal(
  input: RequestInfo | URL,
  init: RequestInit,
  options: { operation: MealRequestOperation; requestId?: string },
  timeoutMs?: number,
) {
  const controller = timeoutMs === undefined ? null : new AbortController();
  const timer = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  let responseReturned = false;
  try {
    const response = await fetch(input, controller ? { ...init, signal: controller.signal } : init);
    // Keep the signal alive until the caller consumes the response body. This
    // prevents a response that sends headers but never finishes JSON from
    // bypassing the request deadline.
    responseReturned = true;
    return response;
  } catch (error) {
    const classified = classifyMealClientError(error, options.operation, options.requestId);
    console.warn("[meal-analysis] client request failed", {
      requestId: options.requestId,
      operation: options.operation,
      code: classified.code,
      reason: errorName(error),
    });
    throw classified;
  } finally {
    if (timer !== null && !responseReturned) globalThis.clearTimeout(timer);
  }
}

/** Runs a meal request without a deadline for callers that own their lifecycle. */
export async function fetchMeal(
  input: RequestInfo | URL,
  init: RequestInit,
  options: { operation: MealRequestOperation; requestId?: string },
) {
  return requestMeal(input, init, options);
}

export async function fetchMealWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  options: { operation: MealRequestOperation; requestId?: string },
) {
  return requestMeal(input, init, options, timeoutMs);
}
