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
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "draft" })).toBe("Brouillon");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "saving" })).toBe("Enregistrement…");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "saved" })).toBe("Brouillon sauvegardé");
    expect(journalStatusText({ validated: true, validating: false, saveStatus: "saved" })).toBe("Journée validée");
    expect(journalStatusText({ validated: false, validating: true, saveStatus: "saving" })).toBe("Validation…");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "error" })).toBe("Échec de l’enregistrement");
    expect(journalStatusText({ validated: true, validating: false, saveStatus: "error" })).toBe("Échec de l’enregistrement");
  });

  it("renders a stable draft status with an accessible live region", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: [], days: [], todayDate }));

    expect(html).toContain('class="checkin-state journal-save-status"');
    expect(html).toContain('class="journal-card__header"');
    expect(html).toContain('class="journal-card__heading"');
    expect(html.indexOf("Brouillon")).toBeLessThan(html.indexOf("Valider la journée"));
    expect(html.indexOf("Valider la journée")).toBeLessThan(html.indexOf("Modifier les champs du journal"));
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(">Brouillon</span>");
    expect(html).toContain("Valider la journée");
    expect(html).not.toContain('button type="button">—</button>');
    expect(html).not.toContain(">À confirmer<");
    expect(html).not.toContain("0/2 recorded");
    expect(html).toContain('data-complete="false"');
    expect(html).toContain('aria-label="Confirmer la valeur affichée pour Alcool"');
    expect(html).toContain('aria-label="Confirmer la valeur affichée pour Vacances"');
    expect(html).toContain('aria-label="Confirmer toutes les valeurs affichées pour Matin"');
    expect(html).toContain('aria-label="Confirmer toutes les valeurs affichées pour Contexte de la journée"');
    expect(html).toContain('class="journal-field__automatic-indicator" role="img" aria-label="Détection automatique"');
    expect(html).not.toContain(">Détectée automatiquement<");
    expect(html).not.toContain(">Détecté automatiquement<");
    expect(html).toContain('>Petit déjeuner<');
    expect(html).toContain('>Sucres ajoutés<');
    expect(html).not.toContain('>Breakfast<');
    expect(html).not.toContain('>Added sugar<');
    expect(html).not.toContain('data-period="sleep"');
    expect(html.indexOf("Magnésium")).toBeLessThan(html.indexOf('data-period="day"'));
    expect(html).not.toContain(">Magnesium<");
  });

  it("does not present a saved draft as a validated day", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [{ entryDate: todayDate, status: "validated", validatedAt: `${todayDate}T08:00:00.000Z`, omittedVariableIds: [] }],
      todayDate,
    }));

    expect(html).toContain(">Journée validée</span>");
    expect(html).not.toContain("journal-save-status__icon--success");
    expect(html).not.toContain(">Brouillon sauvegardé</span>");
    expect(html).not.toContain("Valider la journée");
  });

  it("can hide its local date strip when the workspace provides a shared one", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: [], days: [], todayDate, showDateNavigation: false, selectedDate: todayDate }));

    expect(html).not.toContain('class="journal-date-strip"');
  });

  it("marks an explicit false entry as recorded", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: vacation ? [{ variableId: vacation.id, entryDate: todayDate, value: false }] : [],
      days: [],
      todayDate,
    }));

    expect(html).toContain('data-state="recorded"');
    expect(html).not.toContain("1/2 recorded");
    expect(html).toContain('aria-label="Vacances: Enregistrée"');
    expect(html).not.toContain('aria-label="Confirmer la valeur affichée pour Vacances"');
  });

  it("marks an automatic value as recorded and identifies its origin", () => {
    const bedtime = variables.find((variable) => variable.name === "Bedtime");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: bedtime ? [{ variableId: bedtime.id, entryDate: todayDate, value: "22:40", source: "automatic" }] : [],
      days: [],
      todayDate,
    }));

    expect(html).toContain('class="journal-field__automatic-indicator" role="img" aria-label="Détection automatique"');
    expect(html).toContain('aria-label="Heure du coucher: Enregistrée, détection automatique"');
    expect(html).not.toContain("Détectée automatiquement");
    expect(html).not.toContain('aria-label="Confirmer la valeur affichée pour Heure du coucher"');
  });

  it("shows the achievement percentage without changing the field state", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      achievements: vacation ? [{ variableId: vacation.id, percentage: 75, successPeriods: 3, observedPeriods: 4, cadence: "daily" as const, windowStart: "2026-08-23", windowEnd: todayDate }] : [],
      todayDate,
    }));

    expect(html).toContain("Progression 75%");
    expect(html).toContain('data-state="pending"');
  });

  it("offers the breakfast photo shortcut only after Breakfast is set to yes", () => {
    const breakfast = variables.find((variable) => variable.name === "Breakfast");
    const withBreakfast = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: breakfast ? [{ variableId: breakfast.id, entryDate: todayDate, value: true }] : [],
      days: [],
      todayDate,
    }));
    const withoutBreakfast = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: breakfast ? [{ variableId: breakfast.id, entryDate: todayDate, value: false }] : [],
      days: [],
      todayDate,
    }));

    expect(withBreakfast).toContain('href="/meals#meal-breakfast"');
    expect(withBreakfast).toContain('aria-label="Ajouter une photo du petit déjeuner"');
    expect(withoutBreakfast).not.toContain('href="/meals#meal-breakfast"');
  });

  it("does not offer to reconfirm a recorded numeric value", () => {
    const alcohol = variables.find((variable) => variable.name === "Alcohol");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: alcohol ? [{ variableId: alcohol.id, entryDate: todayDate, value: 0 }] : [],
      days: [],
      todayDate,
    }));

    expect(html).toContain('aria-label="Alcool: Enregistrée"');
    expect(html).not.toContain('aria-label="Confirmer la valeur affichée pour Alcool"');
  });

  it("marks a fully recorded period without displaying a counter", () => {
    const dayVariables = variables.filter((variable) => variable.dayPeriod === "day");
    const addedSugar = dayVariables.find((variable) => variable.name === "Added sugar");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [...dayVariables.flatMap((variable) => variable.defaultValue === null ? [] : [{ variableId: variable.id, entryDate: todayDate, value: variable.defaultValue }]), ...(addedSugar ? [{ variableId: addedSugar.id, entryDate: todayDate, value: 0 as const }] : []), ...(variables.find((variable) => variable.name === "Running") ? [{ variableId: variables.find((variable) => variable.name === "Running")!.id, entryDate: todayDate, value: true as const, source: "automatic" as const }] : [])],
      days: [],
      todayDate,
    }));

    expect(html).toContain('class="journal-period journal-period--complete"');
    expect(html).toContain('aria-label="Journée, complète"');
    expect(html).not.toContain("3/3 recorded");
  });

  it("places Personal Lab validation in the morning header row", () => {
    const addedSugar = variables.find((variable) => variable.name === "Added sugar");
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: addedSugar ? [{ variableId: addedSugar.id, entryDate: todayDate, value: 5 }] : [], days: [], todayDate, presentation: "personal-lab", showDateNavigation: false }));
    const actionsStart = html.indexOf('class="journal-card__actions"');
    const actionsEnd = html.indexOf("</header>", actionsStart);

    expect(html.slice(actionsStart, actionsEnd)).not.toContain("Valider la journée");
    expect(html).toContain('class="journal-period__header-row journal-period__header-row--morning"');
    expect(html.indexOf("journal-period__header-row--morning")).toBeLessThan(html.indexOf("Valider la journée"));
    expect(html).toContain('aria-label="Sucres ajoutés: Enregistrée, détection automatique"');
  });
});
