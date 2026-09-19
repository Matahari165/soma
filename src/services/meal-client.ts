export type MealRequestOperation = "load" | "create" | "update" | "upload" | "analyze";
export type MealClientErrorCode = "network" | "timeout" | "unknown";

export const MEAL_ANALYSIS_REQUEST_TIMEOUT_MS = 75_000;
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
  const isAbort = name === "AbortError" || /abort/i.test(name) || /abort/i.test(message);
  const timeout = isAbort || name === "TimeoutError" || /timed?\s*out/i.test(message);
  const network = /failed to fetch|network|load failed|connection/i.test(message) || (name === "TypeError" && /fetch|network|load/i.test(message));
  const code: MealClientErrorCode = timeout ? "timeout" : network ? "network" : "unknown";
  const safeMessage = code === "timeout"
    ? operationMessages[operation].timeout
    : code === "network"
      ? operationMessages[operation].network
      : message || "The Soma request did not succeed. Please try again.";
  return new MealClientError(safeMessage, code, operation, requestId, { cause: error });
}

export function visibleAnalysisError(message: string | null | undefined): string {
  if (!message || !message.trim()) {
    return "Analysis did not succeed. Check your connection and try again.";
  }
  const clean = message.trim();
  if (/aborted|abort/i.test(clean)) {
    return "Analysis is taking longer than expected. Please try again in a few moments.";
  }
  if (/failed to fetch|network|load failed|connection/i.test(clean)) {
    return "Connection to Soma was interrupted. Please check your connection and try again.";
  }
  return clean;
}

async function requestMeal(
  input: RequestInfo | URL,
  init: RequestInit,
  options: { operation: MealRequestOperation; requestId?: string },
  timeoutMs?: number,
) {
  const controller = timeoutMs === undefined ? null : new AbortController();
  let timer = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  const clearTimer = () => {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
      timer = null;
    }
  };
  try {
    const response = await fetch(input, controller ? { ...init, signal: controller.signal } : init);
    // Attach cleanup to ensure the timer does not leak when body is consumed or released.
    if (timer !== null) {
      if (response.body && typeof response.body.getReader === "function") {
        const originalGetReader = response.body.getReader.bind(response.body);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (response.body as any).getReader = (...args: any[]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const reader = (originalGetReader as any)(...args);
          const originalRead = reader.read.bind(reader);
          const originalReleaseLock = reader.releaseLock.bind(reader);
          const originalCancel = reader.cancel.bind(reader);

          reader.read = async () => {
            try {
              const res = await originalRead();
              if (res.done) clearTimer();
              return res;
            } catch (err) {
              clearTimer();
              throw err;
            }
          };
          reader.releaseLock = () => {
            clearTimer();
            originalReleaseLock();
          };
          reader.cancel = async (reason?: unknown) => {
            clearTimer();
            return originalCancel(reason);
          };
          return reader;
        };
      }
      if (typeof response.json === "function") {
        const originalJson = response.json.bind(response);
        response.json = async () => {
          try {
            return await originalJson();
          } finally {
            clearTimer();
          }
        };
      }
      if (typeof response.text === "function") {
        const originalText = response.text.bind(response);
        response.text = async () => {
          try {
            return await originalText();
          } finally {
            clearTimer();
          }
        };
      }
    }
    return response;
  } catch (error) {
    clearTimer();
    const classified = classifyMealClientError(error, options.operation, options.requestId);
    console.warn("[meal-analysis] client request failed", {
      requestId: options.requestId,
      operation: options.operation,
      code: classified.code,
      reason: errorName(error),
    });
    throw classified;
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
