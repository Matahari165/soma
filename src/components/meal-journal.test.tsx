import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiMealToRecord } from "@/domain/meal-record";
import { MealCorrectionPanel, MealJournal, calorieProgressForDisplay, defaultAnalyze, defaultRemoveMeal, defaultSave, defaultSetEntryState, firstAvailableMealSlot, groupMealIngredients, mealHistoryDates, mealPhotoLimitMessage, recordAnalysisToApi, type MealJournalData } from "./meal-journal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const date = "2026-08-31";

afterEach(() => vi.unstubAllGlobals());

describe("MealJournal", () => {
  it("garde la note modifiable et masque la photo après confirmation", () => {
    const html = renderToStaticMarkup(<MealJournal initialData={{
      date,
      meals: {
        lunch: {
          id: "persisted-confirmed-source",
          date,
          slot: "lunch",
          note: "Déjeuner pris au calme.",
          photos: [{ id: "photo-source", url: "/api/meals/persisted-confirmed-source/photos/photo-source", filename: "lunch.jpg", origin: "homemade" }],
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

    expect(lunch).toContain("Photo and note of the day");
    expect(lunch).toContain("Daily note");
    expect(lunch).toContain("Déjeuner pris au calme.");
    expect(lunch).toContain("Photo analyzed then purged.");
    expect(lunch).not.toContain('alt="Photo originale 1 du repas"');
    expect(lunch).not.toContain("/api/meals/persisted-confirmed-source/photos/photo-source");
    expect(lunch).toContain("Confirmed");
    expect(lunch).toContain("<textarea");
    expect(lunch).not.toContain("Photo origin");
    expect(lunch).toContain(">Delete meal</button>");
  });

  it("ne propose pas de supprimer un brouillon qui n’est pas encore enregistré", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {
      lunch: {
        id: "meal-local-draft",
        date,
        slot: "lunch",
        note: "Brouillon local",
        photos: [],
        analysis: null,
        mouthHeat: null,
        stomachLoad: null,
        status: "draft",
      },
    } }} />);

    expect(html).not.toContain(">Delete meal</button>");
  });

  it("supprime un repas enregistré avec la route dédiée", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await defaultRemoveMeal("meal/with spaces");

    expect(fetchMock).toHaveBeenCalledWith("/api/meals/meal%2Fwith%20spaces", { method: "DELETE" });
  });

  it.each(["accepted", "analyzing"] as const)("masque la suppression pendant une analyse %s", (status) => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" date={date} today={date} initialData={{ date, meals: {
      lunch: {
        id: "persisted-active-meal",
        date,
        slot: "lunch",
        note: "Repas en cours",
        photos: [],
        analysis: null,
        mouthHeat: null,
        stomachLoad: null,
        status,
      },
    } }} />);

    expect(html).not.toContain(">Delete meal</button>");
  });

  it.each([
    { disabledSlots: ["lunch"] as const, entryState: "recorded" as const },
    { disabledSlots: [] as const, entryState: "skipped" as const },
  ])("masque la suppression d’un créneau désactivé ou ignoré", ({ disabledSlots, entryState }) => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" disabledSlots={[...disabledSlots]} date={date} today={date} initialData={{ date, meals: {
      lunch: {
        id: "persisted-disabled-meal",
        date,
        slot: "lunch",
        note: "Repas conservé",
        photos: [],
        analysis: { ingredients: [], calories: { low: 300, likely: 350, high: 400 }, proteinGrams: { low: 10, likely: 12, high: 14 } },
        mouthHeat: null,
        stomachLoad: null,
        status: "confirmed",
        entryState,
      },
    } }} />);

    expect(html).not.toContain(">Delete meal</button>");
  });

  it("explique clairement les photos refusées au-delà de la limite", () => {
    expect(mealPhotoLimitMessage(5, 2, 6)).toBe("Maximum 6 photos per meal. 1 photo was not added.");
    expect(mealPhotoLimitMessage(6, 1, 6)).toBe("Maximum limit of 6 photos per meal reached. Remove a photo before adding another.");
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

    expect(html).toContain("Daily journal");
    expect(html).not.toContain("Page dédiée");
    expect(html).not.toContain("score-ring--large");
    expect(html.match(/<textarea/g) ?? []).toHaveLength(0);
    expect(html.match(/>Write note<\/button>/g)).toHaveLength(4);
    expect(html.match(/>Camera<\/button>/g)).toHaveLength(4);
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
            ingredients: [{ id: "food-croissant", name: "Croissant", portion: "" }],
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

    expect(html).toContain(">Croissant</p>");
    expect(html).not.toContain("Croissant &amp; Café");
    expect(html).toContain("Calories: 650 kcal");
    expect(html).toContain("Protein: 10 g");
    expect(html).toContain("Carbohydrates: 120 g");
    expect(html).toContain("Fat: 16 g");
    expect(html).toContain("Added sugar: 5 g");
    expect(html).toContain('aria-label="Protein">P</dt><dd>10g</dd>');
    expect(html).toContain('aria-label="Carbohydrates">C</dt><dd>120g</dd>');
    expect(html).toContain('aria-label="Added sugar">S</dt><dd>5g</dd>');
    expect(html).toContain('aria-label="Déplier Breakfast"');
    expect(html).toContain(">Snack</h3>");
    expect(html).toContain('aria-label="Analyze Lunch"');
    expect(html).toContain('aria-label="Take photo for Lunch"');
    expect(html).toContain('aria-label="Choose photos for Lunch"');
    expect(html).toContain('aria-label="Choose photos for Snack"');
    expect(html).toContain('aria-label="Choose photos for Dinner"');
    const lunchGalleryInput = html.match(/<input[^>]*aria-label="Choose photos for Lunch"[^>]*>/)?.[0];
    expect(lunchGalleryInput).toContain('accept="image/*"');
    expect(lunchGalleryInput).toContain('multiple=""');
    expect(lunchGalleryInput).not.toContain('capture=');
    expect(html).not.toContain("Ajouter une photo pour");
    expect(html.match(/>Camera<\/button>/g)).toHaveLength(3);
    expect(html.match(/>Photos<\/button>/g)).toHaveLength(3);
    expect(html.match(/>Analyze meal<\/span>/g)).toHaveLength(3);
    expect(html.match(/>Skip<\/button>/g)).toHaveLength(3);
    expect(html).not.toContain('aria-label="Edit daily targets"');
  });

  it("renders Skip for every empty lab slot and a reversible state after skipping", () => {
    const emptyHtml = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation={false} date={date} today={date} initialData={{ date, meals: {} }} />);
    expect(emptyHtml.match(/>Skip<\/button>/g)).toHaveLength(4);

    const skippedHtml = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation={false} date={date} today={date} initialData={{ date, meals: {
      breakfast: {
        id: "meal-skipped-breakfast",
        date,
        slot: "breakfast",
        note: "",
        photos: [],
        analysis: null,
        mouthHeat: null,
        stomachLoad: null,
        status: "confirmed",
        entryState: "skipped",
      },
    } }} />);
    const breakfastStart = skippedHtml.indexOf('id="meal-breakfast-title"');
    const lunchStart = skippedHtml.indexOf('id="meal-lunch-title"');
    const breakfast = skippedHtml.slice(breakfastStart, lunchStart);

    expect(breakfast).toContain("Skipped");
    expect(breakfast).toContain("Log this meal");
    expect(breakfast).not.toContain("<textarea");
    expect(breakfast).not.toContain("Camera");
    expect(breakfast).not.toContain("Photos");
  });

  it("keeps skipped confirmed meals out of the client nutrition totals", () => {
    const html = renderToStaticMarkup(<MealJournal variant="meals" showDateNavigation={false} date={date} today={date} initialData={{ date, meals: {
      lunch: {
        id: "meal-skipped-lunch-with-old-analysis",
        date,
        slot: "lunch",
        note: "",
        photos: [],
        analysis: {
          ingredients: [],
          calories: { low: 700, likely: 800, high: 900 },
          proteinGrams: { low: 20, likely: 25, high: 30 },
        },
        mouthHeat: null,
        stomachLoad: null,
        status: "confirmed",
        entryState: "skipped",
      },
    } }} />);

    expect(html).toContain("Calories");
    expect(html).toContain("—<small>kcal / 3,000 kcal</small>");
    expect(html).not.toContain("800 kcal");
  });

  it("réserve l’édition des cibles au journal qui l’autorise", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" allowTargetEditing date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain('aria-label="Edit daily targets"');
    expect(html).toContain('aria-controls="meal-target-editor"');
  });

  it("keeps seven days in the lab date rail even when a route passes a shorter hint", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation date={date} today={date} historyDays={6} initialData={{ date, meals: {} }} />);

    expect(html.match(/aria-pressed=/g)).toHaveLength(7);
  });

  it("keeps unavailable lab calories distinct from an explicit zero", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(calorieProgressForDisplay(null, 3000)).toBeNull();
    expect(html).toContain('role="img"');
    expect(html).toContain('data-state="unavailable"');
    expect(html).toContain('aria-label="Calorie target progress: Calories unavailable"');
    expect(html).not.toContain('aria-valuenow="0"');
  });

  it("renders the four empty meal slots with photo actions", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain("Breakfast");
    expect(html).toContain("Lunch");
    expect(html).toContain("Dinner");
    expect(html).toContain("Snack");
    expect(html.indexOf("Snack")).toBeLessThan(html.indexOf("Dinner"));
    expect(html).toContain("Snack");
    expect(html.match(/>Take a photo<\/button>/g)).toHaveLength(4);
    expect(html.match(/<textarea/g)).toHaveLength(4);
    expect(html).not.toContain(">Décrire le repas<");
    expect(html).toContain('for="meal-breakfast-note"');
    expect(html).toContain("e.g. 2 bananas and a black coffee.");
    expect(html).not.toContain("À commencer");
    expect(html).not.toContain("À remplir");
    expect(html).not.toContain("Avancement des repas");
    expect(html).not.toContain("confirmés");
    expect(html).not.toContain("Confirmé");
    expect(html).not.toMatch(/MATIN|MIDI|SOIR/);
    expect(html).toContain("Calories: unavailable of 3000 kcal");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('aria-label="Meal history"');
    expect(html).not.toContain('aria-label="Previous day"');
    expect(html).not.toContain('aria-label="Next day"');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('score-ring--large');
    expect(html).toContain('aria-label="Edit daily targets"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">Cibles du jour<");
  });

  it("keeps the meals page journal consultable without duplicate capture controls", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" readOnly date={date} today={date} initialData={{ date, meals: {
      lunch: { id: "saved-lunch", date, slot: "lunch", note: "Riz", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    } }} />);
    expect(html).toContain("Riz");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('aria-label="Add a meal"');
    expect(html).not.toContain("Analyze Lunch");
  });

  it("affiche un créneau explicitement pas pris sans lancer ni afficher une analyse", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {
      snack: {
        id: "meal-skipped-snack",
        date,
        slot: "snack",
        note: "",
        photos: [],
        analysis: null,
        mouthHeat: null,
        stomachLoad: null,
        status: "confirmed",
        entryState: "skipped",
      },
    } }} />);
    const snackStart = html.indexOf('id="meal-snack-title"');
    const dinnerStart = html.indexOf('id="meal-dinner-title"');
    const snack = html.slice(snackStart, dinnerStart);

    expect(snack).toContain("Skipped");
    expect(snack).toContain("Log this meal");
    expect(snack).toContain("excluded from the score");
    expect(snack).not.toContain("<textarea");
    expect(snack).not.toContain("Analyser");
  });

  it("expose la synthèse KPI mobile comme un rail parcourable au clavier", () => {
    const html = renderToStaticMarkup(<MealJournal variant="meals" date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain('role="group" tabindex="0" aria-label="Daily nutrition summary"');
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
    expect(html).not.toContain("Ajoute une photo pour lancer l'analyse");
    expect(html).toContain("Analyze");
    expect(html).toContain("Note to analyze");
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

    expect(html).toContain("Add a photo or describe your meal to start analysis.");
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

    expect(html).toContain("Analysis results");
    expect(html).toContain("Nutritional summary");
    expect(html).toContain("Sensations");
    expect(html).toContain("Finalisation…");
    expect(html).toContain("<details");
    expect(html).toContain("open=\"\"");
    expect(html).not.toContain("Confirm result");
    expect(html).not.toContain("Valider le repas");
    expect(html.match(/Analysis results/g)).toHaveLength(1);
  });

  it("shows the snack slot before dinner", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{ date, meals: {} }} />);
    expect(html.indexOf("Snack")).toBeLessThan(html.indexOf("Dinner"));
  });

  it("keeps an explicitly skipped breakfast visible but compact", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} disabledSlots={["breakfast"]} initialData={{ date, meals: {} }} />);
    expect(html).toContain("Slot skipped in journal.");
    expect(html.match(/>Take a photo<\/button>/g)).toHaveLength(3);
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

  it("waits for a queued correction before showing the recalculated meal", async () => {
    const createdIds: string[] = [];
    const progressStages: string[] = [];
    const statusHeaders: Array<HeadersInit | undefined> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/meals") return Response.json({ meal: { id: "server-meal" } }, { status: 201 });
      if (init?.method === "POST") return Response.json({ queued: true, analysis: { status: "queued" }, meal: { id: "server-meal", mealDate: date, mealType: "lunch", note: "Riz", status: "draft", photos: [], analysis: null } }, { status: 202 });
      if (url.endsWith("/analyze")) {
        statusHeaders.push(init?.headers);
        return Response.json({ analysis: { status: "completed" }, meal: { id: "server-meal", mealDate: date, mealType: "lunch", note: "Riz et œufs", status: "confirmed", photos: [], analysis: { result: { summary: "Riz et œufs", dishType: "Riz et œufs", foods: [], totals: { calories: { low: 700, likely: 740, high: 780 }, proteinGrams: { low: 35, likely: 40, high: 45 } } } } } });
      }
      return Response.json({ meal: { id: "server-meal" } });
    }));
    const result = await defaultAnalyze({ date, slot: "lunch", files: [], meal: { id: "meal-local", date, slot: "lunch", note: "Riz", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" } }, { onMealCreated: (id) => createdIds.push(id), onProgress: (progress) => progressStages.push(progress.stage ?? "unknown") });
    expect(createdIds).toEqual(["server-meal"]);
    expect(progressStages).toEqual(["connecting", "queued"]);
    expect(result.status).toBe("confirmed");
    expect(result.analysis?.calories?.likely).toBe(740);
    expect(statusHeaders).toHaveLength(1);
    expect((statusHeaders[0] as Record<string, string>)["X-Analysis-Request-Id"]).toMatch(/^analysis-/);
  });

  it("bounds confirmation when the connection stops responding", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      })));
      const saving = defaultSave({ id: "server-meal", date, slot: "snack", note: "Exemple", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "review" });
      const rejected = expect(saving).rejects.toMatchObject({ code: "timeout", operation: "update" });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows the original request when a retry joins an existing analysis", async () => {
    const joinedRequestId = "analysis-already-running";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json({ meal: { id: "server-meal" } });
      if (init?.method === "POST") return Response.json({ queued: true, analysis: { status: "running", analysisRequestId: joinedRequestId } }, { status: 202 });
      expect(String(input)).toBe("/api/meals/server-meal/analyze");
      expect(new Headers(init?.headers).get("X-Analysis-Request-Id")).toBe(joinedRequestId);
      return Response.json({ analysis: { status: "completed" }, meal: { id: "server-meal", mealDate: date, mealType: "snack", note: "Exemple", status: "confirmed", photos: [], analysis: { result: { summary: "Exemple", foods: [], totals: { calories: { low: 200, likely: 250, high: 300 } } } } } });
    }));
    const result = await defaultAnalyze({ date, slot: "snack", files: [], meal: { id: "server-meal", date, slot: "snack", note: "Exemple", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" } });
    expect(result.status).toBe("confirmed");
    expect(result.analysis?.calories?.likely).toBe(250);
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

  it("forces re-analysis when meal already has an existing analysis", async () => {
    const requests: Array<{ url: string; method: string; body?: { force?: boolean } }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "breakfast", note: "Omelette et café", status: "confirmed", photos: [], analysis: { calories: { likely: 350 } } } });
    }));

    await defaultAnalyze({
      date,
      slot: "breakfast",
      files: [],
      meal: {
        id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee",
        date,
        slot: "breakfast",
        note: "Omelette et café",
        photos: [],
        analysis: { ingredients: [], calories: { low: null, likely: 300, high: null }, proteinGrams: { low: null, likely: 20, high: null } },
        mouthHeat: null,
        stomachLoad: null,
        status: "confirmed",
      },
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe("/api/meals/0199a111-b222-7ccc-8ddd-eeeeeeeeeeee/analyze");
    expect(requests[1]?.body?.force).toBe(true);
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
    })).rejects.toThrow("Add a photo or a description");

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
        { id: `server-photo-${requests.filter((request) => request.url.includes("/photos")).length}`, mealId: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", origin: "homemade", mimeType: "image/jpeg", bytes: first.size, filename: first.name, createdAt: `${date}T12:00:00.000Z` },
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
          { id: "photo-1", url: "blob:one", filename: "IMG_0001.jpg", origin: "homemade", comment: "Sauce à part" },
          { id: "photo-2", url: "blob:two", filename: "IMG_0001.jpg", origin: "prepared", comment: "Dessert" },
        ],
        analysis: null,
        mouthHeat: null,
        stomachLoad: null,
        status: "draft",
      },
    });

    const uploads = requests.filter((request) => request.url.includes("/photos"));
    expect(uploads).toHaveLength(2);
    expect(uploads.map((upload) => upload.init?.headers)).toEqual([
      { "Idempotency-Key": "meal-0199a111-b222-7ccc-8ddd-eeeeeeeeeeee-photo-photo-1" },
      { "Idempotency-Key": "meal-0199a111-b222-7ccc-8ddd-eeeeeeeeeeee-photo-photo-2" },
    ]);
    expect(uploads.map((upload) => (upload.init?.body as FormData).getAll("photos"))).toEqual([[first], [second]]);
    expect(uploads.map((upload) => (upload.init?.body as FormData).get("comment_0"))).toEqual(["Sauce à part", "Dessert"]);
    expect(uploads.map((upload) => (upload.init?.body as FormData).get("origin"))).toEqual(["homemade", "prepared"]);
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

    expect(html).toContain('aria-label="Analysis correction"');
    expect(html).toContain("Natural language correction");
    expect(html).toContain('id="meal-correction-meal-review"');
    expect(html).toContain("Re-analyze");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("Retirer Riz");
    expect(html).not.toContain("Aliment manquant");
    expect(html).not.toContain("Incertitudes");
  });
  it("rend la navigation lointaine accessible en variant lab avec flèches et choix direct", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" date={date} today={date} initialData={{ date, meals: {} }} />);

    expect(html).toContain('aria-label="Previous day"');
    expect(html).toContain('aria-label="Next day"');
    expect(html).toContain('type="date"');
    expect(html).toContain('id="meal-date-picker"');
    expect(html).toContain("Select date");
    expect(html).toContain(`max="${date}"`);
  });

  it("simplifie le journal Nutrition en lecture seule sans perdre la navigation ni les détails du repas", () => {
    const html = renderToStaticMarkup(<div className="meals-page"><MealJournal variant="lab" className="meal-journal-lab" readOnly date={date} today={date} initialData={{
      date,
      meals: {
        breakfast: {
          id: "read-only-confirmed-breakfast",
          date,
          slot: "breakfast",
          note: "Lait et pain.",
          photos: [{ id: "breakfast-photo", url: "/api/meals/read-only-confirmed-breakfast/photos/breakfast-photo", filename: "breakfast.jpg", origin: "homemade" }],
          analysis: {
            ingredients: [],
            calories: { low: 400, likely: 500, high: 600 },
            proteinGrams: { low: 20, likely: 25, high: 30 },
            carbohydratesGrams: { low: 40, likely: 45, high: 50 },
            fatGrams: { low: 10, likely: 12, high: 15 },
            addedSugarGrams: { low: 2, likely: 4, high: 6 },
          },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
        snack: {
          id: "read-only-skipped-snack",
          date,
          slot: "snack",
          note: "",
          photos: [],
          analysis: null,
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
          entryState: "skipped",
        },
        dinner: {
          id: "read-only-retry-dinner",
          date,
          slot: "dinner",
          note: "",
          photos: [],
          analysis: null,
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
          error: "analysis_failed",
        },
      },
    }} /></div>);
    const breakfastStart = html.indexOf('id="meal-breakfast-title"');
    const breakfastContent = html.slice(breakfastStart, html.indexOf('id="meal-lunch-title"'));
    const breakfastHeader = breakfastContent.slice(0, breakfastContent.indexOf("</header>"));
    const snackStart = html.indexOf('id="meal-snack-title"');
    const snackContent = html.slice(snackStart, html.indexOf('id="meal-dinner-title"'));

    expect(breakfastContent).not.toContain(">Confirmed</p>");
    expect(breakfastHeader).toContain('aria-label="Photos and notes for Breakfast"');
    expect(breakfastContent).toContain("Daily note");
    expect(breakfastContent).toContain('data-metric="calories"');
    expect(breakfastContent).toContain('data-metric="protein"');
    expect(breakfastContent).toContain('data-metric="carbs"');
    expect(breakfastContent).toContain('data-metric="fat"');
    expect(breakfastContent).toContain('data-metric="sugar"');
    expect(snackContent).toMatch(/^id="meal-snack-title"[^>]*>Snack<span[^>]*role="status"[^>]*>Skipped<\/span><\/h3>/);
    expect(html).toContain('aria-label="Meal history"');
    expect(html).toContain('data-purpose="timeline-selector"');
    expect(html).toContain('aria-label="Show previous days"');
    expect(html).not.toContain('aria-label="Previous day"');
    expect(html).toContain("Needs retry");
    expect(html).not.toContain("Select date");
    expect(html).not.toContain('id="meal-date-picker"');
  });

  it("affiche les badges Confirmé et Brouillon ainsi que le compteur de note", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{
      date,
      meals: {
        lunch: {
          id: "meal-draft-brouillon",
          date,
          slot: "lunch",
          note: "",
          photos: [],
          analysis: null,
          mouthHeat: null,
          stomachLoad: null,
          status: "draft",
        },
        dinner: {
          id: "meal-confirmed-badge",
          date,
          slot: "dinner",
          note: "Soupe",
          photos: [],
          analysis: { ingredients: [], calories: { low: 200, likely: 250, high: 300 }, proteinGrams: { low: 10, likely: 12, high: 15 } },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    }} />);

    expect(html).toContain("Draft");
    expect(html).toContain("Confirmed");
    expect(html).toContain("0/500");
    expect(html).toContain('aria-describedby="meal-lunch-analyze-hint"');
  });
  it("propose d’annuler une analyse en cours depuis le créneau concerné", () => {
    const html = renderToStaticMarkup(<MealJournal date={date} today={date} initialData={{
      date,
      meals: {
        lunch: {
          id: "meal-analyzing",
          date,
          slot: "lunch",
          note: "Pâtes",
          photos: [],
          analysis: null,
          mouthHeat: null,
          stomachLoad: null,
          status: "analyzing",
        },
      },
    }} />);

    expect(html).toContain("Analyzing…");
    expect(html).toContain(">Cancel</button>");
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

    expect(html).toContain(">Main course<");
    expect(html).toContain(">Side<");
    expect(html).toContain(">Dessert<");
    expect(html).toContain('data-parent-id="dish"');
    expect(html.indexOf("Pâtes aux légumes")).toBeLessThan(html.indexOf("Spaghettis"));
    expect(html.indexOf("Spaghettis")).toBeLessThan(html.indexOf("Carotte"));
  });

  it("keeps calorie percentages realistic above the target", () => {
    expect(calorieProgressForDisplay(4500, 3000)).toBe(150);
    expect(calorieProgressForDisplay(6000, 3000)).toBe(200);
  });

  it("masque les contrôles photo après confirmation et garde les ressentis", () => {
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

    expect(html).toContain("Photo analyzed then purged.");
    expect(html).not.toContain("Photo origin");
    expect(html).not.toContain("Origin helps analysis");
    expect(html).toContain("Mouth heat");
    expect(html).toContain("Stomach heaviness");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Calories: 650 of 3000 kcal");
    for (const metric of ["calories", "protein", "fat", "carbs", "fiber", "sugar"]) {
      expect(html).toContain(`data-metric="${metric}"`);
    }
    expect(html).not.toContain("Confiance");
    expect(html).toContain("Nutritional summary");
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

  it("enregistre un état pas pris par une seule requête, sans analyse ni zéro nutritionnel", async () => {
    let request: { url: string; method?: string; body?: string } | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = { url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, method: init?.method, body: String(init?.body ?? "") };
      return Response.json({ meal: { id: "0199a111-b222-7ccc-8ddd-eeeeeeeeeeee", mealDate: date, mealType: "snack", status: "draft", entryState: "skipped", note: null, photos: [], analysis: null } }, { status: 201 });
    }));

    const result = await defaultSetEntryState({ id: "meal-local-skip", date, slot: "snack", note: "", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" }, "skipped");

    expect(request).toMatchObject({ url: "/api/meals", method: "POST" });
    expect(JSON.parse(request?.body ?? "{}")).toEqual({ mealDate: date, mealType: "snack", entryState: "skipped" });
    expect(result).toMatchObject({ entryState: "skipped", analysis: null });
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

    expect(html).toContain("Added sugar");
    expect(html).toContain('data-metric="sugar"');
  });
});

describe("apiMealToRecord", () => {
  it("keeps durable queue acceptance distinct from active execution", () => {
    const accepted = apiMealToRecord({ id: "meal-queued", mealDate: date, mealType: "lunch", status: "draft", photos: [], analysis: { id: "analysis-queued", status: "queued", result: null, error: null } });
    const running = apiMealToRecord({ id: "meal-running", mealDate: date, mealType: "lunch", status: "draft", photos: [], analysis: { id: "analysis-running", status: "running", result: null, error: null } });

    expect(accepted.status).toBe("accepted");
    expect(running.status).toBe("analyzing");
  });

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
      summary: "Repas corrigé : œufs ajoutés.",
      calories: { low: null, high: null },
      proteinGrams: { low: null, high: null },
      note: "Description normale du repas",
      uncertainties: [],
    });

    expect(payload.uncertainties).toEqual([]);
    expect(payload.summary).toBe("Repas corrigé : œufs ajoutés.");
  });

  it("preserves rich food observations when confirming an analysis", () => {
    const payload = recordAnalysisToApi({
      ingredients: [{
        id: "food-1",
        sourceId: "food-1",
        name: "Boisson alcoolisée",
        portion: "250 ml",
        estimatedGrams: null,
        countedInTotals: false,
        alcoholic: true,
        novaGroup: 4,
        sugarExposure: { concentrated: true, liquid: true },
        qualityProperties: [],
        observation: { portion: "observed", novaGroup: "observed", sugarExposure: "observed", qualityProperties: "none_observed" },
        confidence: "medium",
      }],
      calories: { low: null, high: null },
      proteinGrams: { low: null, high: null },
    });

    expect(payload.foods[0]).toMatchObject({ id: "food-1", alcoholic: true, countedInTotals: false, novaGroup: 4, sugarExposure: { concentrated: true, liquid: true }, qualityProperties: [], observation: { qualityProperties: "none_observed" } });
  });

  it("renders lab meal card in V1 with ingredients, nutrition bars, and no repeated dish label", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation={false} date={date} today={date} initialData={{
      date,
      meals: {
        breakfast: {
          id: "meal-lab-1",
          date,
          slot: "breakfast",
          note: "mon petit déjeuner",
          photos: [],
          analysis: {
            dishType: "Omelette aux fines herbes",
            ingredients: [
              { id: "ing-1", name: "Œufs", portion: "2 pièces", calories: { low: null, likely: 140, high: null } },
              { id: "ing-2", name: "Fines herbes", portion: "10 g", calories: { low: null, likely: 10, high: null } },
            ],
            calories: { low: null, likely: 250, high: null },
            proteinGrams: { low: null, likely: 18, high: null },
            carbohydratesGrams: { low: null, likely: 2, high: null },
            fatGrams: { low: null, likely: 19, high: null },
            addedSugarGrams: { low: null, likely: 0, high: null },
          },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    }} />);

    expect(html).toContain("Œufs · Fines herbes");
    expect(html).not.toContain(">Omelette aux fines herbes</p>");
    expect(html).not.toContain("Daily note");
    expect(html).not.toContain("mon petit déjeuner");
    expect(html).toContain("250");
    expect(html).toContain("18");
    expect(html).toContain('aria-label="Déplier Breakfast"');
    expect(html).not.toContain("Analysis details");
    expect(html).not.toContain("Confirm meal");
  });

  it("renders clean calorie header without logged or pending counts and without floating delete row in lab mode", () => {
    const html = renderToStaticMarkup(<MealJournal variant="lab" showDateNavigation={false} date={date} today={date} initialData={{
      date,
      meals: {
        breakfast: {
          id: "meal-lab-header-test",
          date,
          slot: "breakfast",
          note: "Petit dej",
          photos: [],
          analysis: {
            dishType: "Granola",
            ingredients: [],
            calories: { low: null, likely: 450, high: null },
            proteinGrams: { low: null, likely: 15, high: null },
          },
          mouthHeat: null,
          stomachLoad: null,
          status: "confirmed",
        },
      },
    }} />);

    expect(html).toContain("Nutrition Log");
    expect(html).not.toContain("450 / 3,000 kcal");
    expect(html).not.toContain("logged ·");
    expect(html).not.toContain("pending</p>");
    expect(html).not.toContain("labMealDeleteRow");
  });
});
