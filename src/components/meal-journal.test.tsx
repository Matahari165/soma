import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MealJournal, apiMealToRecord, mealHistoryDates, type MealJournalData } from "./meal-journal";

const date = "2026-08-31";

describe("MealJournal", () => {
  it("renders the three empty meal slots with photo actions", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain("Petit déjeuner");
    expect(html).toContain("Déjeuner");
    expect(html).toContain("Dîner");
    expect(html.match(/>Prendre une photo<\/button>/g)).toHaveLength(3);
    expect(html).toContain("0/3 confirmés");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('aria-label="Historique des repas"');
    expect(html).toContain('aria-label="Jour précédent"');
    expect(html).toContain('aria-label="Jour suivant"');
    expect(html).toContain('type="date"');
    expect(html).toContain('max="2026-08-31"');
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
          photos: [
            { id: "photo-1", url: "/photo-1.jpg", filename: "lunch.jpg", origin: "prepared" },
            { id: "photo-2", url: "/photo-2.jpg", filename: "lunch-2.jpg", origin: "homemade" },
          ],
          analysis: {
            ingredients: [{ id: "food-1", name: "Riz", portion: "1 bol" }],
            calories: { low: 550, high: 750 },
            proteinGrams: { low: 25, high: 35 },
          },
          mouthHeat: 3,
          stomachLoad: 4,
          status: "confirmed",
        },
      },
    };
    const html = renderToStaticMarkup(<MealJournal initialData={data} />);

    expect(html.match(/Origine de lunch\.jpg/g)).toHaveLength(1);
    expect(html.match(/Maison/g)).toHaveLength(2);
    expect(html.match(/Préparé \/ acheté/g)).toHaveLength(2);
    expect(html).toContain("Bouche chaude");
    expect(html).toContain("Repas qui m’a cassé");
    expect(html).toContain('aria-pressed="true"');
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
      photos: [{ id: "photo-3", url: "/api/meals/meal-2/photos/photo-3", filename: "breakfast.jpg", origin: "homemade" }],
      analysis: {
        id: "analysis-2",
        status: "completed",
        error: null,
        result: {
          foods: [{ name: "Yaourt", portion: "1 pot", confidence: "high" }],
          totals: { calories: { low: 120, likely: 150, high: 180 }, proteinGrams: null },
          confidence: "high",
          summary: "Petit déjeuner simple.",
          uncertainties: [],
        },
      },
    });

    expect(meal).toMatchObject({ id: "meal-2", date, slot: "breakfast", status: "confirmed", mouthHeat: 0, stomachLoad: null });
    expect(meal.photos[0]).toMatchObject({ filename: "breakfast.jpg", origin: "homemade" });
    expect(meal.analysis?.calories).toEqual({ low: 120, likely: 150, high: 180 });
    expect(meal.analysis?.proteinGrams).toEqual({ low: null, likely: null, high: null });
  });
});
