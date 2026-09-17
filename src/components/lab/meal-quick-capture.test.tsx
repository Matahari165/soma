import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { JournalVariable } from "@/domain/lab/journal";
import { breakfastIsExplicitlySkipped, createMealAndAnalyze, mealQuickSlotIsFilled, MealQuickCapture, morningJournalIsConfirmed } from "./meal-quick-capture";

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
});
