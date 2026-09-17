import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealSupplements } from "./meal-supplements";

const definition = {
  id: "creatine-1",
  productName: "Créatine monohydrate",
  brand: null,
  category: "creatine" as const,
  source: "personal_record" as const,
  sourceReference: null,
  serving: { quantity: 5, unit: "g" as const, label: "1 dose" },
  nutrients: [],
  frequency: { kind: "daily" as const, timesPerDay: 1 },
  notes: null,
  usageInstruction: "Avec le déjeuner",
  archivedAt: null,
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
  contributionScope: "separate" as const,
};

describe("MealSupplements", () => {
  it("shows the empty state and the add form", () => {
    const html = renderToStaticMarkup(<MealSupplements date="2026-09-12" initialDefinitions={[]} initialEntries={[]} />);
    expect(html).toContain("Supplements");
    expect(html).toContain("Product");
    expect(html).toContain("Usual dose");
    expect(html).toContain("No supplements.");
  });

  it("shows a daily yes/no check-in with a distinct unrecorded state", () => {
    const html = renderToStaticMarkup(<MealSupplements date="2026-09-12" initialDefinitions={[definition]} initialEntries={[]} />);
    expect(html).toContain("Créatine monohydrate");
    expect(html).toContain("1 dose · Avec le déjeuner");
    expect(html).toContain("Not recorded");
    expect(html).toContain("Yes");
    expect(html).toContain("Skip");
    expect(html).toContain("Archive");
    expect(html).toContain('aria-pressed="false"');
  });

  it("keeps archived products in a collapsed history without a daily control", () => {
    const html = renderToStaticMarkup(<MealSupplements date="2026-09-12" initialDefinitions={[{ ...definition, archivedAt: "2026-09-13T10:00:00.000Z" }]} initialEntries={[]} />);
    expect(html).toContain("Archived items (1)");
    expect(html).not.toContain("Archive</button>");
  });
});
