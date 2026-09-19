import { describe, expect, it, vi } from "vitest";

import { classifyMealClientError, fetchMeal } from "./meal-client";

describe("meal client transport errors", () => {
  it("turns browser Failed to fetch errors into a stable English message", () => {
    const error = classifyMealClientError(new TypeError("Failed to fetch"), "analyze", "analysis-test-1");

    expect(error).toMatchObject({
      name: "MealClientError",
      code: "network",
      operation: "analyze",
      requestId: "analysis-test-1",
      message: "Connection to Soma was interrupted during analysis. Please try again.",
    });
  });

  it("turns an aborted request into an operation-specific timeout", () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";

    expect(classifyMealClientError(error, "upload").message).toBe("Uploading photos took too long. Check your connection and try again.");
  });

  it("turns WebKit 'Fetch is aborted' error into an analysis timeout message", () => {
    const error = new Error("Fetch is aborted");
    error.name = "AbortError";

    const classified = classifyMealClientError(error, "analyze", "analysis-webkit-1");
    expect(classified).toMatchObject({
      name: "MealClientError",
      code: "timeout",
      operation: "analyze",
      requestId: "analysis-webkit-1",
      message: "Analysis is taking longer than expected. Please try again in a few moments.",
    });
  });

  it("turns raw DOMException 'Fetch is aborted' without AbortError name into timeout", () => {
    const error = new Error("Fetch is aborted");

    const classified = classifyMealClientError(error, "analyze", "analysis-webkit-2");
    expect(classified).toMatchObject({
      code: "timeout",
      operation: "analyze",
      message: "Analysis is taking longer than expected. Please try again in a few moments.",
    });
  });

  it("does not add a deadline to meal analysis requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await fetchMeal("/api/meals/meal-1/analyze", { method: "POST" }, { operation: "analyze", requestId: "analysis-test-2" });

    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("signal");
    fetchMock.mockRestore();
  });
});

