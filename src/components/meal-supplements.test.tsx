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
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
  contributionScope: "separate" as const,
};

describe("MealSupplements", () => {
  it("shows the empty state and the add form", () => {
    const html = renderToStaticMarkup(<MealSupplements date="2026-09-12" initialDefinitions={[]} initialEntries={[]} />);
    expect(html).toContain("Compléments");
    expect(html).toContain("Nom du produit");
    expect(html).toContain("Aucun complément renseigné.");
  });

  it("shows a definition and the separate intake area", () => {
    const html = renderToStaticMarkup(<MealSupplements date="2026-09-12" initialDefinitions={[definition]} initialEntries={[]} />);
    expect(html).toContain("Créatine monohydrate");
    expect(html).toContain("Suivi séparé");
    expect(html).toContain("Prises du 2026-09-12");
    expect(html).toContain("Pris aujourd’hui");
  });
});
