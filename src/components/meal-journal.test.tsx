import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiMealToRecord } from "@/domain/meal-record";
import { MealCorrectionPanel, MealJournal, calorieProgressForDisplay, defaultAnalyze, defaultSave, firstAvailableMealSlot, groupMealIngredients, mealHistoryDates, mealPhotoLimitMessage, recordAnalysisToApi, type MealJournalData } from "./meal-journal";

const date = "2026-08-31";

afterEach(() => vi.unstubAllGlobals());

describe("MealJournal", () => {
  it("expose la photo et la note originales après confirmation sans rouvrir le formulaire", () => {
    const html = renderToStaticMarkup(<MealJournal initialData={{
      date,
      meals: {
        lunch: {
          id: "meal-confirmed-source",
          date,
          slot: "lunch",
          note: "Déjeuner pris au calme.",
          photos: [{ id: "photo-source", url: "/api/meals/meal-confirmed-source/photos/photo-source", filename: "lunch.jpg", origin: "homemade" }],
          analysis: { ingredients: [], calories: { low: 400, likely: 500, high: 600 }, proteinGrams: { low: 20, likely: 25, high: 30 } },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    }} />);
    const lunchStart = html.indexOf('id="meal-lunch-title"');
    const snackStart = html.indexOf('id="meal-snack-title"');
    const lunch = html.slice(lunchStart, snackStart);

    expect(lunch).toContain("Photo et note du jour");
    expect(lunch).toContain("Note du jour");
    expect(lunch).toContain("Déjeuner pris au calme.");
    expect(lunch).toContain('alt="Photo originale 1 du repas"');
    expect(lunch).toContain("/api/meals/meal-confirmed-source/photos/photo-source");
    expect(lunch).not.toContain("<textarea");
    expect(lunch).not.toContain("Ajouter une photo");
  });

  it("explique clairement les photos refusées au-delà de la limite", () => {
    expect(mealPhotoLimitMessage(5, 2, 6)).toBe("6 photos maximum par repas. 1 photo n’a pas été ajoutée.");
    expect(mealPhotoLimitMessage(6, 1, 6)).toBe("Maximum de 6 photos par repas atteint. Retire une photo avant d’en ajouter une autre.");
    expect(mealPhotoLimitMessage(4, 2, 6)).toBeNull();
  });

  it("targets the first empty enabled slot when adding a meal", () => {
    const breakfast = {
      id: "breakfast",
      date,
      slot: "breakfast" as const,
      note: "Café",
      photos: [],
      analysis: null,
      mouthHeat: null,
      stomachLoad: null,
      status: "draft" as const,
    };

    expect(firstAvailableMealSlot({ breakfast }, [])).toBe("lunch");
    expect(firstAvailableMealSlot({ breakfast }, ["lunch"])).toBe("snack");
    expect(firstAvailableMealSlot({ breakfast, lunch: breakfast, snack: breakfast, dinner: breakfast }, [])).toBeNull();
  });

  it("uses a compact home variant without moving the full calorie banner", () => {
    const html = renderToStaticMarkup(<MealJournal variant="home" showDateNavigation={false} date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain("Journal quotidien");
    expect(html).not.toContain("Page dédiée");
    expect(html).not.toContain("score-ring--large");
    expect(html.match(/<textarea/g) ?? []).toHaveLength(0);
    expect(html.match(/>Écrire<\/button>/g)).toHaveLength(4);
    expect(html.match(/>Caméra<\/button>/g)).toHaveLength(4);
    expect(html.match(/>Photos<\/button>/g)).toHaveLength(4);
  });

  it("presents the homepage meal rail with five nutrition fields and quiet empty actions", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation={false} date={date} today={date} initialData={{
      date,
      meals: {
        breakfast: {
          id: "meal-breakfast-lab",
          date,
          slot: "breakfast",
          note: "Croissant & Café",
          photos: [],
          analysis: {
            ingredients: [],
            dishType: "Croissant & Café",
            calories: { low: 640, likely: 650, high: 660 },
            proteinGrams: { low: 9, likely: 10, high: 11 },
            carbohydratesGrams: { low: 115, likely: 120, high: 125 },
            fatGrams: { low: 15, likely: 16, high: 17 },
            addedSugarGrams: { low: 4, likely: 5, high: 6 },
          },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    }} />);

    expect(html).toContain("Croissant &amp; Café");
    expect(html).toContain("Calories : 650 kcal");
    expect(html).toContain("Protéines : 10 g");
    expect(html).toContain("Glucides : 120 g");
    expect(html).toContain("Lipides : 16 g");
    expect(html).toContain("Sucres ajoutés : 5 g");
    expect(html).toContain(">Modifier<\/button>");
    expect(html).toContain(">Collation<\/h3>");
    expect(html.match(/aria-label="Ajouter une photo"/g)).toHaveLength(3);
    expect(html.match(/>Analyser le repas<\/span>/g)).toHaveLength(3);
  });

  it("keeps seven days in the lab date rail even when a route passes a shorter hint", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation date={date} today={date} historyDays={6} initialData={{ date, meals: {} }} />);

    expect(html.match(/aria-pressed=/g)).toHaveLength(7);
  });

  it("renders the four empty meal slots with photo actions", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain("Petit déjeuner");
    expect(html).toContain("Déjeuner");
    expect(html).toContain("Dîner");
    expect(html).toContain("Collation");
    expect(html.indexOf("Collation")).toBeLessThan(html.indexOf("Dîner"));
    expect(html).toContain("Collation");
    expect(html.match(/>Prendre une photo<\/button>/g)).toHaveLength(4);
    expect(html.match(/<textarea/g)).toHaveLength(4);
    expect(html).not.toContain(">Décrire le repas<");
    expect(html).toContain('for="meal-breakfast-note"');
    expect(html).toContain("Ex. 2 bananes et un café.");
    expect(html).not.toContain("À commencer");
    expect(html).not.toContain("À remplir");
    expect(html).not.toContain("Avancement des repas");
    expect(html).not.toContain("confirmés");
    expect(html).not.toContain("Confirmé");
    expect(html).not.toMatch(/MATIN|MIDI|SOIR/);
    expect(html).toContain("Calories : indisponibles sur 3000 kilocalories");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('aria-label="Historique des repas"');
    expect(html).not.toContain('aria-label="Jour précédent"');
    expect(html).not.toContain('aria-label="Jour suivant"');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('score-ring--large');
    expect(html).toContain('aria-label="Modifier les cibles du jour"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">Cibles du jour<");
  });

  it("expose la synthèse KPI mobile comme un rail parcourable au clavier", () => {
    const html = renderToStaticMarkup(<MealJournal variant="meals" date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain('role="group" tabindex="0" aria-label="Synthèse nutritionnelle de la journée"');
    expect(html).toContain('>—<small>kcal');
  });

  it("allows analyzing a draft with text-only, photo-only, or both", () => {
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
    expect(html).not.toContain("Ajoute une photo pour lancer l’analyse");
    expect(html).toContain("Analyser");
    expect(html).toContain("Texte à analyser");
  });

  it("disables analysis when neither photo nor text is provided", () => {
    const draft: MealJournalData = {
      date,
      meals: {
        lunch: {
          id: "meal-draft-empty",
          date,
          slot: "lunch",
          note: "",
          photos: [],
          analysis: null,
          mouthHeat: null,
          stomachLoad: null,
          status: "draft",
        },
      },
    };
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={draft} />);

    expect(html).toContain("Ajoute une photo ou décris ton repas pour lancer l’analyse.");
  });

  it("keeps analysis results available behind a compact disclosure", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{
      date,
      meals: {
        lunch: {
          id: "meal-analysis",
          date,
          slot: "lunch",
          photos: [],
          note: "Pâtes",
          analysis: { ingredients: [], calories: { low: 400, high: 600 }, proteinGrams: { low: 20, high: 30 } },
          mouthHeat: null,
          stomachLoad: null,
          status: "review",
        },
      },
    }} />);

    expect(html).toContain("Résultats de l’analyse");
    expect(html).toContain("Résumé nutritionnel");
    expect(html).toContain("Ressentis");
    expect(html).toContain("<details");
    expect(html).toContain("open=\"\"");
    expect(html.match(/Résultats de l’analyse/g)).toHaveLength(1);
  });

  it("shows the snack slot before dinner", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {} }} />);
    expect(html.indexOf("Collation")).toBeLessThan(html.indexOf("Dîner"));
  });

  it("keeps an explicitly skipped breakfast visible but compact", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} disabledSlots={["breakfast"]} initialData={{ date, meals: {} }} />);
    expect(html).toContain("Créneau ignoré dans le journal.");
    expect(html.match(/>Prendre une photo<\/button>/g)).toHaveLength(3);
  });

  it("creates and analyzes a new text-only meal without requiring photos", async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      if (url === "/api/meals") {
        return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee" } }, { status: 201 });
      }
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "breakfast", note: "2 bananes", status: "review", photos: [], analysis: { calories: { likely: 210 } } } });
    }));

    const result = await defaultAnalyze({
      date,
      slot: "breakfast",
      files: [],
      meal: { id: "meal-new", date, slot: "breakfast", note: "2 bananes", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ url: "/api/meals", method: "POST", body: { mealDate: date, mealType: "breakfast", note: "2 bananes", status: "draft" } });
    expect(requests[1]?.url).toBe("/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee/analyze");
    expect(result.id).toBe("0199a111-b222-7ccc-8ddd-eeeeeeeeeeee");
  });

  it("updates and analyzes an existing text-only meal without requiring photos", async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "breakfast", note: "2 bananes", status: "review", photos: [], analysis: { calories: { likely: 210 } } } });
    }));

    const result = await defaultAnalyze({
      date,
      slot: "breakfast",
      files: [],
      meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", date, slot: "breakfast", note: "2 bananes", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ url: "/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", method: "PATCH", body: { note: "2 bananes" } });
    expect(requests[1]?.url).toBe("/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee/analyze");
    expect(result.id).toBe("0199a111-b222-7ccc-8ddd-eeeeeeeeeeee");
  });

  it("rejects analysis when neither photo nor note is provided", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      requests.push({ url, method });
      return Response.json({});
    }));

    await expect(defaultAnalyze({
      date,
      slot: "breakfast",
      files: [],
      meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", date, slot: "breakfast", note: "   ", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    })).rejects.toThrow("Ajoute une photo ou une description");

    expect(requests).toEqual([]);
  });

  it("sends a natural-language correction with the forced analysis", async () => {
    let analyzeBody: unknown;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/analyze")) analyzeBody = JSON.parse(String(init?.body));
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "lunch", note: "Pâtes", status: "draft", photos: [], analysis: null } });
    }));

    await defaultAnalyze({
      date,
      slot: "lunch",
      files: [],
      meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", date, slot: "lunch", note: "Pâtes", photos: [{ id: "photo-stored", url: "/api/meals/photo-stored", filename: "lunch.jpg", origin: "homemade" }], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
      correction: "Il y avait une petite portion de pâtes, pas une grande.",
    });

    expect(analyzeBody).toMatchObject({ force: true, correction: "Il y avait une petite portion de pâtes, pas une grande." });
    expect(typeof (analyzeBody as { idempotencyKey?: unknown }).idempotencyKey).toBe("string");
  });

  it("keeps duplicate filenames tied to the right photo and makes upload retries safe", async () => {
    const first = new File(["one"], "IMG_0001.jpg", { type: "image/jpeg" });
    const second = new File(["two"], "IMG_0001.jpg", { type: "image/jpeg" });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requests.push({ url, init });
      if (url.includes("/photos")) return Response.json({ photos: [
        { id: "server-photo-1", mealId: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", origin: "homemade", mimeType: "image/jpeg", bytes: first.size, filename: first.name, createdAt: `${date}T12:00:00.000Z` },
        { id: "server-photo-2", mealId: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", origin: "prepared", mimeType: "image/jpeg", bytes: second.size, filename: second.name, createdAt: `${date}T12:00:00.000Z` },
      ] }, { status: 201 });
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "lunch", note: null, status: "draft", photos: [], analysis: null } });
    }));

    await defaultAnalyze({
      date,
      slot: "lunch",
      files: [first, second],
      photoFiles: [{ photoId: "photo-1", file: first }, { photoId: "photo-2", file: second }],
      meal: {
        id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee",
        date,
        slot: "lunch",
        note: "Pâtes",
        photos: [
          { id: "photo-1", url: "blob:one", filename: "IMG_0001.jpg", origin: "homemade" },
          { id: "photo-2", url: "blob:two", filename: "IMG_0001.jpg", origin: "prepared" },
        ],
        analysis: null,
        mouthHeat: null,
        stomachLoad: null,
        status: "draft",
      },
    });

    const upload = requests.find((request) => request.url.includes("/photos"));
    expect(upload?.init?.headers).toEqual({ "Idempotency-Key": "meal-0199a111-b222-7ccc-8ddd-eeeeeeeeeeee-photos-photo-1-photo-2" });
    expect((upload?.init?.body as FormData).get("origins")).toBe(JSON.stringify(["homemade", "prepared"]));
    expect((upload?.init?.body as FormData).getAll("photos")).toEqual([first, second]);
  });

  it("returns uploaded photo records before analysis so a failed retry does not resend them", async () => {
    const file = new File(["one"], "lunch.jpg", { type: "image/jpeg" });
    const uploadedPhoto = { id: "0199a111-b222-7ccc-8ddd-ffffffffffff", mealId: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", origin: "homemade" as const, mimeType: "image/jpeg", bytes: file.size, filename: file.name, createdAt: `${date}T12:00:00.000Z`, url: "/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee/photos/0199a111-b222-7ccc-8ddd-ffffffffffff" };
    const uploadPairs: unknown[] = [];
    let analysisCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/photos")) return Response.json({ photos: [uploadedPhoto] }, { status: 201 });
      if (url.includes("/analyze")) {
        analysisCalls += 1;
        return analysisCalls === 1
          ? Response.json({ error: "Le service d’analyse est momentanément indisponible." }, { status: 503 })
          : Response.json({ meal: { id: uploadedPhoto.mealId, mealDate: date, mealType: "lunch", note: "Pâtes", status: "draft", photos: [uploadedPhoto], analysis: null } });
      }
      return Response.json({ meal: { id: uploadedPhoto.mealId, mealDate: date, mealType: "lunch", note: "Pâtes", status: "draft", photos: [], analysis: null } });
    }));
    const input = {
      date,
      slot: "lunch" as const,
      files: [file],
      photoFiles: [{ photoId: "photo-local-1", file }],
      meal: { id: uploadedPhoto.mealId, date, slot: "lunch" as const, note: "Pâtes", photos: [{ id: "photo-local-1", url: "blob:one", filename: file.name, origin: "homemade" as const }], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" as const },
    };

    await expect(defaultAnalyze(input, { onPhotosUploaded: (pairs) => uploadPairs.push(...pairs) })).rejects.toThrow("Le service d’analyse est momentanément indisponible.");
    expect(uploadPairs).toEqual([{ localPhotoId: "photo-local-1", photo: uploadedPhoto }]);

    await defaultAnalyze({ ...input, files: [], photoFiles: [], meal: { ...input.meal, photos: [uploadedPhoto] } });
    expect(analysisCalls).toBe(2);
  });

  it("renders one accessible natural-language correction field", () => {
    const meal: NonNullable<MealJournalData["meals"]["lunch"]> = {
      id: "meal-review",
      date,
      slot: "lunch",
      note: "",
      photos: [],
      analysis: {
        ingredients: [{ id: "food-1", name: "Riz", portion: "1 bol" }],
        calories: { low: 450, high: 650 },
        proteinGrams: { low: 15, high: 25 },
        uncertainties: ["portion à revoir"],
      },
      mouthHeat: null,
      stomachLoad: null,
      status: "review",
    };
    const html = renderToStaticMarkup(<MealCorrectionPanel meal={meal} onCorrection={() => undefined} onCancel={() => undefined} />);

    expect(html).toContain('aria-label="Correction de l’analyse"');
    expect(html).toContain("Correction en langage naturel");
    expect(html).toContain('id="meal-correction-meal-review"');
    expect(html).toContain("Réanalyser");
    expect(html).toContain("Annuler");
    expect(html).not.toContain("Retirer Riz");
    expect(html).not.toContain("Aliment manquant");
    expect(html).not.toContain("Incertitudes");
  });
  it("shows seven navigable dates without offering a future day", () => {
    expect(mealHistoryDates("2026-08-31", "2026-08-31")).toEqual([
      "2026-08-31", "2026-08-30", "2026-08-29", "2026-08-28", "2026-08-27", "2026-08-26", "2026-08-25",
    ]);
    expect(mealHistoryDates("2026-08-10", "2026-08-31")).toEqual([
      "2026-08-13", "2026-08-12", "2026-08-11", "2026-08-10", "2026-08-09", "2026-08-08", "2026-08-07",
    ]);
  });

  it("keeps a composed dish distinct from side and dessert items", () => {
    const ingredients = [
      { id: "dish", name: "Pâtes aux légumes", portion: "", kind: "dish" as const, course: "main" as const },
      { id: "spaghetti", name: "Spaghettis", portion: "2 assiettes", kind: "component" as const, parentId: "dish" },
      { id: "carrot", name: "Carotte", portion: "1", kind: "ingredient" as const, foodGroups: ["vegetable" as const] },
      { id: "peaches", name: "Pêches", portion: "3", kind: "ingredient" as const, foodGroups: ["fruit" as const] },
    ];
    const roots = groupMealIngredients(ingredients);
    expect(roots).toHaveLength(3);
    expect(roots[0]?.children.map((node) => node.ingredient.name)).toEqual(["Spaghettis"]);

    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {
      dinner: { id: "meal-composed", date, slot: "dinner", note: "Pâtes, carotte à côté, pêches en dessert", photos: [], analysis: { ingredients, calories: { low: 700, likely: 900, high: 1100 }, proteinGrams: { low: 25, likely: 35, high: 45 } }, mouthHeat: null, stomachLoad: null, status: "confirmed" },
    } }} />);

    expect(html).toContain(">Plat<");
    expect(html).toContain(">Accompagnement<");
    expect(html).toContain(">Dessert<");
    expect(html).toContain('data-parent-id="dish"');
    expect(html.indexOf("Pâtes aux légumes")).toBeLessThan(html.indexOf("Spaghettis"));
    expect(html.indexOf("Spaghettis")).toBeLessThan(html.indexOf("Carotte"));
  });

  it("keeps calorie percentages realistic above the target", () => {
    expect(calorieProgressForDisplay(4500, 3000)).toBe(150);
    expect(calorieProgressForDisplay(6000, 3000)).toBe(200);
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
            sugarGrams: { low: 12, likely: 18, high: 25 },
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
    for (const metric of ["calories", "protein", "fat", "carbs", "fiber", "sugar"]) {
      expect(html).toContain(`data-metric="${metric}"`);
    }
    expect(html).not.toContain("Confiance");
    expect(html).toContain("Résumé nutritionnel");
    expect(html).not.toContain("Texte à compléter");
  });

  it("envoie les deux ressentis dans chaque sauvegarde d’un repas confirmé", async () => {
    let payload: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({});
    }));

    await defaultSave({ id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", date, slot: "lunch", note: "Pâtes", photos: [], analysis: null, mouthHeat: 3, stomachLoad: 4, status: "confirmed", error: null, confirmedAt: null });

    expect(payload).toMatchObject({ status: "confirmed", mouthWarmthIntensity: 3, stomachOverfullIntensity: 4 });
  });

  it("shows each ingredient quantity once in parentheses", () => {
    const data: MealJournalData = {
      date,
      meals: {
        lunch: {
          id: "meal-quantity",
          date,
          slot: "lunch",
          note: "",
          photos: [],
          analysis: {
            ingredients: [
              { id: "food-pasta", name: "Pâtes", portion: "300 g", estimatedGrams: 300 },
              { id: "food-banana", name: "Bananes", portion: "Deux bananes", estimatedGrams: null },
            ],
            calories: { low: 400, likely: 500, high: 600 },
            proteinGrams: { low: null, likely: null, high: null },
          },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    };

    const html = renderToStaticMarkup(<MealJournal initialData={data} />);

    expect(html).toContain("Pâtes (300 g)");
    expect(html).not.toContain("Pâtes (300 g) · 300 g");
    expect(html).toContain("Bananes (Deux bananes)");
  });

  it("uses added sugar as the fallback sugar metric", () => {
    const data: MealJournalData = {
      date,
      meals: {
        snack: {
          id: "meal-added-sugar",
          date,
          slot: "snack",
          note: "",
          photos: [],
          analysis: {
            ingredients: [],
            calories: { low: 100, likely: 120, high: 140 },
            proteinGrams: { low: 2, likely: 3, high: 4 },
            addedSugarGrams: { low: 5, likely: 7, high: 9 },
          },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    };

    const html = renderToStaticMarkup(<MealJournal initialData={data} />);

    expect(html).toContain("Sucres ajoutés");
    expect(html).toContain('data-metric="sugar"');
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
        foods: [{ id: "food-1", name: "Yaourt", portion: "1 pot", estimatedGrams: 125, preparation: "nature", course: "dessert", alcoholic: false, novaGroup: 2, sugarExposure: { concentrated: false, liquid: false }, qualityProperties: ["minimally_processed"], observation: { portion: "observed", novaGroup: "observed", sugarExposure: "none_observed", qualityProperties: "observed" }, sugarGrams: { low: 8, likely: 10, high: 12 }, confidence: "high" }],
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
    expect(meal.analysis?.ingredients[0]).toMatchObject({ id: "food-1", sourceId: "food-1", estimatedGrams: 125, preparation: "nature", course: "dessert", novaGroup: 2, sugarExposure: { concentrated: false, liquid: false }, qualityProperties: ["minimally_processed"], observation: { portion: "observed", novaGroup: "observed", sugarExposure: "none_observed", qualityProperties: "observed" }, sugarGrams: { low: 8, likely: 10, high: 12 } });
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

  it("preserves a missing likely estimate when saving an analysis", () => {
    const payload = recordAnalysisToApi({
      ingredients: [],
      calories: { low: 300, high: 500 },
      proteinGrams: { low: null, high: null },
    });

    expect(payload.totals.calories).toEqual({ low: 300, high: 500 });
  });

  it("does not turn a descriptive note into an uncertainty", () => {
    const payload = recordAnalysisToApi({
      ingredients: [],
      calories: { low: null, high: null },
      proteinGrams: { low: null, high: null },
      note: "Description normale du repas",
      uncertainties: [],
    });

    expect(payload.uncertainties).toEqual([]);
  });

  it("preserves rich food observations when confirming an analysis", () => {
    const payload = recordAnalysisToApi({
      ingredients: [{
        id: "food-1",
        sourceId: "food-1",
        name: "Jus",
        portion: "250 ml",
        estimatedGrams: null,
        countedInTotals: true,
        novaGroup: 4,
        sugarExposure: { concentrated: true, liquid: true },
        qualityProperties: [],
        observation: { portion: "observed", novaGroup: "observed", sugarExposure: "observed", qualityProperties: "none_observed" },
        confidence: "medium",
      }],
      calories: { low: null, high: null },
      proteinGrams: { low: null, high: null },
    });

    expect(payload.foods[0]).toMatchObject({ id: "food-1", novaGroup: 4, sugarExposure: { concentrated: true, liquid: true }, qualityProperties: [], observation: { qualityProperties: "none_observed" } });
  });
});
