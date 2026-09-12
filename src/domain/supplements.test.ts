import { describe, expect, it } from "vitest";

import {
  supplementCategories,
  supplementContributionScope,
  supplementDefinitionInputSchema,
  supplementDefinitionToView,
  supplementEntryInputSchema,
} from "./supplements";

const definition = {
  productName: "Magnésium bisglycinate",
  category: "vitamin_mineral",
  source: "product_label",
  serving: { quantity: 2, unit: "capsule", label: "2 gélules" },
  nutrients: [{ key: "magnesium", label: "Magnésium", amount: 200, unit: "mg" }],
  frequency: { kind: "daily", timesPerDay: 1 },
};

describe("supplement domain", () => {
  it("accepts every product category and keeps score scope explicit", () => {
    expect(supplementCategories).toEqual(["vitamin_mineral", "protein", "creatine", "caffeine", "electrolyte", "other"]);
    expect(supplementContributionScope("protein")).toBe("protein");
    expect(supplementContributionScope("vitamin_mineral")).toBe("micronutrients");
    expect(supplementContributionScope("electrolyte")).toBe("micronutrients");
    expect(supplementContributionScope("creatine")).toBe("separate");
    expect(supplementContributionScope("caffeine")).toBe("separate");
    expect(supplementContributionScope("other")).toBe("separate");
  });

  it("preserves product composition, serving, source, and planned versus actual intake", () => {
    const parsedDefinition = supplementDefinitionInputSchema.parse({ ...definition, usageInstruction: "Avec un repas contenant du gras" });
    expect(parsedDefinition.nutrients).toEqual([{ key: "magnesium", label: "Magnésium", amount: 200, unit: "mg" }]);
    expect(parsedDefinition.usageInstruction).toBe("Avec un repas contenant du gras");
    const entry = supplementEntryInputSchema.parse({
      definitionId: "supplement-1",
      entryDate: "2026-09-12",
      planned: { servings: 1, scheduledAt: "2026-09-12T08:00:00+02:00" },
      actual: { status: "taken", servings: 0.5, takenAt: "2026-09-12T08:14:00+02:00" },
    });
    expect(entry.planned.servings).toBe(1);
    expect(entry.actual).toMatchObject({ status: "taken", servings: 0.5 });
  });

  it("accepts a check-in status without asking for the dose again", () => {
    expect(supplementEntryInputSchema.parse({ definitionId: "s", entryDate: "2026-09-12", status: "taken" })).toMatchObject({
      planned: { servings: 1 },
      actual: { status: "taken", servings: null },
    });
    expect(() => supplementEntryInputSchema.parse({ definitionId: "s", entryDate: "2026-09-12", planned: { servings: 1 }, actual: { status: "skipped", servings: 1 } })).toThrow();
    expect(supplementEntryInputSchema.parse({ definitionId: "s", entryDate: "2026-09-12", planned: { servings: 1 } }).actual).toMatchObject({ status: "not_recorded", servings: null });
  });

  it("keeps unreliable nutrition contributions separate", () => {
    expect(supplementDefinitionToView({
      ...supplementDefinitionInputSchema.parse({ ...definition, source: "personal_record" }),
      id: "s-1",
      userId: "u-1",
      createdAt: "2026-09-12T10:00:00.000Z",
      updatedAt: "2026-09-12T10:00:00.000Z",
      archivedAt: null,
    }).contributionScope).toBe("separate");
    expect(supplementDefinitionToView({
      ...supplementDefinitionInputSchema.parse({ ...definition, source: "product_label" }),
      id: "s-2",
      userId: "u-1",
      createdAt: "2026-09-12T10:00:00.000Z",
      updatedAt: "2026-09-12T10:00:00.000Z",
      archivedAt: null,
    }).contributionScope).toBe("micronutrients");
  });
});
