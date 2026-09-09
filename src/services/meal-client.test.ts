import { describe, expect, it } from "vitest";

import { classifyMealClientError } from "./meal-client";

describe("meal client transport errors", () => {
  it("turns browser Failed to fetch errors into a stable French message", () => {
    const error = classifyMealClientError(new TypeError("Failed to fetch"), "analyze", "analysis-test-1");

    expect(error).toMatchObject({
      name: "MealClientError",
      code: "network",
      operation: "analyze",
      requestId: "analysis-test-1",
      message: "La connexion à Soma a été interrompue pendant l’analyse. Réessaie.",
    });
  });

  it("turns an aborted request into an operation-specific timeout", () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";

    expect(classifyMealClientError(error, "upload").message).toBe("L’envoi des photos a pris trop de temps. Vérifie ta connexion puis réessaie.");
  });
});
