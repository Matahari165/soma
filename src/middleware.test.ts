import { describe, expect, it } from "vitest";

import { requestBodyLimitForPath } from "@/middleware";

describe("requestBodyLimitForPath", () => {
  it("allows the bounded multipart meal photo route", () => {
    expect(requestBodyLimitForPath("/api/meals/meal-id/photos")).toBe(41 * 1024 * 1024);
    expect(requestBodyLimitForPath("/api/meals/analyze")).toBe(41 * 1024 * 1024);
  });

  it("keeps the strict default limit for other mutations and nested photo routes", () => {
    expect(requestBodyLimitForPath("/api/meals/meal-id")).toBe(64 * 1024);
    expect(requestBodyLimitForPath("/api/meals/meal-id/photos/photo-id")).toBe(64 * 1024);
  });
});
