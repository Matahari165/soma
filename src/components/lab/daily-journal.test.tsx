import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { defaultJournalVariables, type JournalVariable } from "@/domain/lab/journal";

import { DailyJournal, journalStatusText } from "./daily-journal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayDate = "2026-08-26";
const variables: JournalVariable[] = defaultJournalVariables.map((variable, index) => ({ ...variable, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, isActive: true, options: [...variable.options] }));

describe("journal motion states", () => {
  it("keeps save and validation language distinct", () => {
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "draft" })).toBe("Draft");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "saving" })).toBe("Saving…");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "saved" })).toBe("Draft saved");
    expect(journalStatusText({ validated: true, validating: false, saveStatus: "saved" })).toBe("Validated");
    expect(journalStatusText({ validated: false, validating: true, saveStatus: "saving" })).toBe("Validating…");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "error" })).toBe("Save failed");
    expect(journalStatusText({ validated: true, validating: false, saveStatus: "error" })).toBe("Save failed");
  });

  it("renders a stable draft status with an accessible live region", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: [], days: [], todayDate }));

    expect(html).toContain('class="checkin-state journal-save-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(">Draft</span>");
    expect(html).toContain("Validate day");
  });

  it("does not present a saved draft as a validated day", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [{ entryDate: todayDate, status: "validated", validatedAt: `${todayDate}T08:00:00.000Z`, omittedVariableIds: [] }],
      todayDate,
    }));

    expect(html).toContain(">Validated</span>");
    expect(html).toContain("journal-save-status__icon--success");
    expect(html).not.toContain(">Draft saved</span>");
    expect(html).not.toContain("Validate day");
  });
});
