import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { JournalVariable } from "@/domain/lab/journal";
import { breakfastIsExplicitlySkipped, MealQuickCapture } from "./meal-quick-capture";

const breakfast = { id: "breakfast-id", name: "Breakfast", variableType: "boolean", unit: null, options: [], position: 10, isActive: true, emoji: "🍳", defaultValue: false, dayPeriod: "morning" } satisfies JournalVariable;
const todayDate = "2026-08-31";

describe("MealQuickCapture", () => {
  it("shows three direct photo actions", () => {
    const html = renderToStaticMarkup(<MealQuickCapture todayDate={todayDate} variables={[breakfast]} entries={[]} days={[]} />);
    expect(html).toContain("Repas aujourd’hui");
    expect(html).toContain("Matin");
    expect(html).toContain("Midi");
    expect(html).toContain("Soir");
    expect(html).toContain("Goûter");
    expect(html.match(/>Photo</g)).toHaveLength(4);
  });

  it("only disables breakfast for an explicit no on a validated day", () => {
    const entries = [{ variableId: breakfast.id, entryDate: todayDate, value: false }];
    expect(breakfastIsExplicitlySkipped({ todayDate, variables: [breakfast], entries, days: [] })).toBe(false);
    expect(breakfastIsExplicitlySkipped({ todayDate, variables: [breakfast], entries: [], days: [{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }] })).toBe(false);
    expect(breakfastIsExplicitlySkipped({ todayDate, variables: [breakfast], entries, days: [{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }] })).toBe(true);
  });

  it("renders the validated breakfast skip as disabled", () => {
    const html = renderToStaticMarkup(<MealQuickCapture todayDate={todayDate} variables={[breakfast]} entries={[{ variableId: breakfast.id, entryDate: todayDate, value: false }]} days={[{ entryDate: todayDate, status: "validated", validatedAt: "2026-08-31T08:00:00Z", omittedVariableIds: [] }]} />);
    expect(html).toContain("Pas de petit déjeuner");
    expect(html).toContain("disabled=\"\"");
  });

  it("uses the live validation override without waiting for a server refresh", () => {
    const html = renderToStaticMarkup(<MealQuickCapture todayDate={todayDate} variables={[breakfast]} entries={[]} days={[]} breakfastDisabledOverride />);
    expect(html).toContain("Pas de petit déjeuner");
    expect(html).toContain("disabled=\"\"");
  });
});
