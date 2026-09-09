export type MealRequestOperation = "load" | "create" | "update" | "upload" | "analyze";
export type MealClientErrorCode = "network" | "timeout" | "unknown";

const operationMessages: Record<MealRequestOperation, { timeout: string; network: string }> = {
  load: {
    timeout: "Le chargement des repas a pris trop de temps. Réessaie.",
    network: "La connexion à Soma a été interrompue pendant le chargement des repas.",
  },
  create: {
    timeout: "La création du repas a pris trop de temps. Réessaie.",
    network: "La connexion à Soma a été interrompue pendant la création du repas.",
  },
  update: {
    timeout: "La mise à jour du repas a pris trop de temps. Réessaie.",
    network: "La connexion à Soma a été interrompue pendant la mise à jour du repas.",
  },
  upload: {
    timeout: "L’envoi des photos a pris trop de temps. Vérifie ta connexion puis réessaie.",
    network: "La connexion à Soma a été interrompue pendant l’envoi des photos.",
  },
  analyze: {
    timeout: "L’analyse prend plus de temps que prévu. Réessaie dans quelques instants.",
    network: "La connexion à Soma a été interrompue pendant l’analyse. Réessaie.",
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
      : message || "La requête Soma n’a pas abouti. Réessaie.";
  return new MealClientError(safeMessage, code, operation, requestId, { cause: error });
}

export async function fetchMealWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  options: { operation: MealRequestOperation; requestId?: string },
) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
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
    globalThis.clearTimeout(timer);
  }
}
