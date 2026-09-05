import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MealJournal, apiMealToRecord, defaultAnalyze, mealHistoryDates, type MealJournalData } from "./meal-journal";

const date = "2026-08-31";

afterEach(() => vi.unstubAllGlobals());

describe("MealJournal", () => {
  it("renders the four empty meal slots with photo actions", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain("Petit déjeuner");
    expect(html).toContain("Déjeuner");
    expect(html).toContain("Dîner");
    expect(html).toContain("Collation");
    expect(html).toContain("Goûter");
    expect(html.match(/>Prendre une photo<\/button>/g)).toHaveLength(4);
    expect(html.match(/<textarea/g)).toHaveLength(4);
    expect(html).not.toContain(">Décrire le repas<");
    expect(html).toContain('for="meal-breakfast-note"');
    expect(html).toContain("Ex. 2 bananes et un café.");
    expect(html).not.toContain("À commencer");
    expect(html).not.toContain("Avancement des repas");
    expect(html).not.toContain("confirmés");
    expect(html).toContain("Calories : indisponibles sur 3000 kilocalories");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('aria-label="Historique des repas"');
    expect(html).not.toContain('aria-label="Jour précédent"');
    expect(html).not.toContain('aria-label="Jour suivant"');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('score-ring--large');
    expect(html).toContain('aria-label="Modifier les cibles du jour"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("shows an analyze button for a text-only draft", () => {
    const draft: MealJournalData = {
      date,
      meals: {
        lunch: {
          id: "meal-draft-text",
          date,
          slot: "lunch",
          note: "2 bananes et un café",
          photos: [],
          analysis: null,
          mouthHeat: null,
          stomachLoad: null,
          status: "draft",
        },
      },
    };
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={draft} />);

    expect(html).toContain("<textarea");
    expect(html).toContain(">Analyser</button>");
    expect(html).not.toContain("Grok");
    expect(html).not.toContain("aria-describedby");
  });

  it("creates then analyzes a new text-only meal without a redundant update", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      requests.push({ url, method });
      if (url === "/api/meals") {
        return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee" } }, { status: 201 });
      }
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "breakfast", note: "2 bananes", status: "draft", photos: [], analysis: null } });
    }));

    await defaultAnalyze({
      date,
      slot: "breakfast",
      files: [],
      meal: { id: "meal-new", date, slot: "breakfast", note: "2 bananes", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    });

    expect(requests).toEqual([
      { url: "/api/meals", method: "POST" },
      { url: "/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee/analyze", method: "POST" },
    ]);
  });

  it("updates then analyzes an existing text-only meal", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      requests.push({ url, method });
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "breakfast", note: "2 bananes", status: "draft", photos: [], analysis: null } });
    }));

    await defaultAnalyze({
      date,
      slot: "breakfast",
      files: [],
      meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", date, slot: "breakfast", note: "2 bananes", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    });

    expect(requests).toEqual([
      { url: "/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", method: "PATCH" },
      { url: "/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee/analyze", method: "POST" },
    ]);
  });
  it("shows seven navigable dates without offering a future day", () => {
    expect(mealHistoryDates("2026-08-31", "2026-08-31")).toEqual([
      "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
    ]);
    expect(mealHistoryDates("2026-08-10", "2026-08-31")).toEqual([
      "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
    ]);
  });

  it("keeps one origin control and the two compact feelings per meal", () => {
    const data: MealJournalData = {
      date,
      meals: {
        lunch: {
          id: "meal-1",
          date,
          slot: "lunch",
          note: "",
          photos: [
            { id: "photo-1", url: "/photo-1.jpg", filename: "lunch.jpg", origin: "prepared" },
            { id: "photo-2", url: "/photo-2.jpg", filename: "lunch-2.jpg", origin: "homemade" },
          ],
          analysis: {
            ingredients: [{ id: "food-1", name: "Riz", portion: "1 bol" }],
            calories: { low: 550, likely: 650, high: 750 },
            proteinGrams: { low: 25, likely: 30, high: 35 },
            confidence: "low",
          },
          mouthHeat: 3,
          stomachLoad: 4,
          status: "confirmed",
        },
      },
    };
    const html = renderToStaticMarkup(<MealJournal initialData={data} />);

    expect(html).not.toContain("Origine de la photo");
    expect(html).toContain("Bouche chaude");
    expect(html).toContain("Repas qui m&#x27;a cassé");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Calories : 650 sur 3000 kilocalories");
    expect(html).not.toContain("Confiance");
  });
});

describe("apiMealToRecord", () => {
  it("maps the canonical meal response and preserves null versus explicit zero", () => {
    const meal = apiMealToRecord({
      id: "meal-2",
      mealDate: date,
      mealType: "breakfast",
      status: "confirmed",
      mouthWarmthIntensity: 0,
      stomachOverfullIntensity: null,
      updatedAt: `${date}T09:00:00.000Z`,
      photos: [{ id: "photo-3", url: "/api/meals/meal-2/photos/photo-3", filename: "breakfast.jpg", origin: "homemade", storageStatus: "purged", purgedAt: `${date}T10:00:00.000Z` }],
      analysis: {
        id: "analysis-2",
        status: "completed",
        error: null,
        result: {
          foods: [{ name: "Yaourt", portion: "1 pot", estimatedGrams: 125, preparation: "nature", sugarGrams: { low: 8, likely: 10, high: 12 }, confidence: "high" }],
          totals: { calories: { low: 120, likely: 150, high: 180 }, proteinGrams: null, sugarGrams: { low: 8, likely: 10, high: 12 } },
          confidence: "high",
          summary: "Petit déjeuner simple.",
          uncertainties: [],
        },
      },
    });

    expect(meal).toMatchObject({ id: "meal-2", date, slot: "breakfast", status: "confirmed", mouthHeat: 0, stomachLoad: null });
    expect(meal.photos[0]).toMatchObject({ filename: "breakfast.jpg", origin: "homemade", storageStatus: "purged" });
    expect(meal.analysis?.calories).toEqual({ low: 120, likely: 150, high: 180 });
    expect(meal.analysis?.proteinGrams).toEqual({ low: null, likely: null, high: null });
    expect(meal.analysis?.sugarGrams).toEqual({ low: 8, likely: 10, high: 12 });
    expect(meal.analysis?.ingredients[0]).toMatchObject({ estimatedGrams: 125, preparation: "nature", sugarGrams: { low: 8, likely: 10, high: 12 } });
  });

  it("keeps the last successful analysis visible after a failed retry", () => {
    const meal = apiMealToRecord({
      id: "meal-retry",
      mealDate: date,
      mealType: "dinner",
      status: "confirmed",
      photos: [],
      analysis: { id: "failed", status: "failed", result: null, error: "Grok est momentanément sollicité." },
      lastSuccessfulAnalysis: {
        id: "successful",
        status: "completed",
        result: {
          foods: [{ name: "Poulet rôti", portion: "1 cuisse", confidence: "medium" }],
          totals: { calories: { low: 350, likely: 420, high: 520 }, proteinGrams: { low: 30, likely: 38, high: 45 } },
          confidence: "medium",
          summary: "Poulet rôti.",
          uncertainties: [],
        },
      },
    });

    expect(meal.status).toBe("confirmed");
    expect(meal.analysis?.ingredients[0]?.name).toBe("Poulet rôti");
    expect(meal.analysis?.calories.likely).toBe(420);
  });
});
