import { describe, expect, it } from "vitest";

import { apiMealToRecord, MEAL_SLOTS } from "./meal-record";

describe("meal record server boundary", () => {
  it("keeps the page adapter in a shared, server-safe module", () => {
    expect(MEAL_SLOTS).toEqual(["breakfast", "lunch", "snack", "dinner"]);
    expect(apiMealToRecord({ id: "meal-server", mealDate: "2026-09-05", mealType: "lunch", status: "draft", photos: [] })).toMatchObject({
      id: "meal-server",
      date: "2026-09-05",
      slot: "lunch",
      status: "draft",
    });
  });
});
