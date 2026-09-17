import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { JournalVariable } from "@/domain/lab/journal";
import { breakfastIsExplicitlySkipped, createMealAndAnalyze, mealQuickErrorAction, mealQuickSlotIsFilled, MealQuickCapture, morningJournalIsConfirmed, retryMealAnalysis } from "./meal-quick-capture";

const breakfast = { id: "breakfast-id", name: "Breakfast", variableType: "boolean", unit: null, options: [], position: 10, isActive: true, emoji: "🍳", defaultValue: false, dayPeriod: "morning" } satisfies JournalVariable;
const todayDate = "2026-08-31";

describe("MealQuickCapture", () => {
  it("shows three direct photo actions", () => {
    const html = renderToStaticMarkup(<MealQuickCapture todayDate={todayDate} variables={[breakfast]} entries={[]} days={[]} />);
    expect(html).toContain('id="meal-quick-title">Repas</h2>');
    expect(html).not.toContain("Repas aujourd’hui");
    expect(html).not.toContain("Photos des repas");
    expect(html).toContain("Petit déjeuner");
    expect(html).toContain("Déjeuner");
    expect(html).toContain("Dîner");
    expect(html).toContain("Collation");
    expect(html).not.toContain("Matin");
    expect(html).not.toContain("Midi");
    expect(html).not.toContain("Soir");
    expect(html.match(/>Photo</g)).toHaveLength(4);
    expect(html.match(/>Analyser le texte</g)).toHaveLength(4);
    expect(html.match(/<textarea/g)).toHaveLength(4);
  });

  it("only disables breakfast for an explicit no on a validated day", () => {
    const entries = [{ variableId: breakfast.id, entryDate: todayDate, value: false }];
    expect(breakfastIsExplicitlySkipped({ todayDate, variables: [breakfast], entries, days: [] })).toBe(false);
    expect(breakfastIsExplicitlySkipped({ todayDate, variables: [breakfast], entries: [], days: [{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }] })).toBe(false);
    expect(breakfastIsExplicitlySkipped({ todayDate, variables: [breakfast], entries, days: [{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }] })).toBe(true);
  });

  it("renders the validated breakfast skip as disabled", () => {
    const html = renderToStaticMarkup(<MealQuickCapture todayDate={todayDate} variables={[breakfast]} entries={[{ variableId: breakfast.id, entryDate: todayDate, value: false }]} days={[{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }]} />);
    expect(html).toContain(">Ignoré</button>");
    expect(html).not.toContain("Pas de petit déjeuner");
    expect(html).toContain("disabled=\"\"");
  });

  it("marks a confirmed meal or a validated morning journal as filled without requiring a photo", () => {
    expect(mealQuickSlotIsFilled({ status: "confirmed", photos: [] })).toBe(true);
    expect(mealQuickSlotIsFilled({ status: "draft", photos: [] })).toBe(false);
    expect(mealQuickSlotIsFilled({ status: "draft", photos: [], note: "2 bananes" })).toBe(true);
    expect(mealQuickSlotIsFilled({ status: "draft", photos: [{ id: "photo-1" }] })).toBe(true);
    expect(morningJournalIsConfirmed({
      todayDate,
      variables: [breakfast],
      entries: [{ variableId: breakfast.id, entryDate: todayDate, value: true }],
      days: [{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }],
    })).toBe(true);
  });

  it("uses the live validation override without waiting for a server refresh", () => {
    const html = renderToStaticMarkup(<MealQuickCapture todayDate={todayDate} variables={[breakfast]} entries={[]} days={[]} breakfastDisabledOverride />);
    expect(html).toContain(">Ignoré</button>");
    expect(html).toContain("disabled=\"\"");
  });

  it("sends a text-only meal without creating a photo upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ meal: { id: "meal-text", note: "" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ meal: { id: "meal-text", note: "2 bananes" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ analysis: { status: "queued" } }), { status: 202 }));

    await createMealAndAnalyze(todayDate, "snack", { note: "2 bananes" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/meals/meal-text");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ note: "2 bananes" });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/meals/meal-text/analyze");
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/photos"))).toBe(false);
    fetchMock.mockRestore();
  });

  it("retries an existing failed meal with a fresh idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ analysis: { status: "queued" } }), { status: 202 }));

    await expect(retryMealAnalysis("meal-text")).resolves.toBe("queued");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/meals/meal-text/analyze");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ force: true });
    expect((init?.headers as Record<string, string>)["X-Analysis-Request-Id"]).toMatch(/^analysis-/);
    fetchMock.mockRestore();
  });

  it("retries text after an initial failure instead of opening the photo picker", () => {
    expect(mealQuickErrorAction({ note: "2 bananes", origin: null })).toBe("resubmit-text");
    expect(mealQuickErrorAction({ mealId: "meal-text", note: "2 bananes", origin: null })).toBe("retry");
  });

  it("preserves the created meal id when starting analysis fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ meal: { id: "meal-text", note: "2 bananes" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Analyse indisponible" }), { status: 503 }));

    await expect(createMealAndAnalyze(todayDate, "snack", { note: "2 bananes" })).rejects.toMatchObject({ mealId: "meal-text" });
    fetchMock.mockRestore();
  });
});
