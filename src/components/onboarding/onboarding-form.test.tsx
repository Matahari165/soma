import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { formatSleepDuration, OnboardingForm } from "./onboarding-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("OnboardingForm - Architecture et étapes", () => {
  it("présente les 5 étapes dans l’ordre canonique", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 0 }));

    expect(html).toContain("Vous");
    expect(html).toContain("Objectif");
    expect(html).toContain("Habitudes");
    expect(html).toContain("Sommeil");
    expect(html).toContain("Données de santé");
  });

  it("affiche les champs d’identité à l’étape 0", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 0 }));

    expect(html).toContain("À propos de vous");
    expect(html).toContain("Nom");
    expect(html).toContain("Date de naissance");
    expect(html).toContain("Taille (cm)");
    expect(html).toContain("Poids (kg)");
  });

  it("affiche le choix de l’objectif à l’étape 1", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 1 }));

    expect(html).toContain("Quel est votre objectif principal");
    expect(html).toContain("Développer sa masse musculaire");
    expect(html).toContain("Améliorer son endurance");
    expect(html).toContain("Objectif secondaire (facultatif)");
  });
});

describe("OnboardingForm - Catalogue d’habitudes saines (Étape 2)", () => {
  it("affiche les 3 thématiques d'habitudes avec leurs titres clairs", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 2 }));

    expect(html).toContain("Vos habitudes de santé");
    expect(html).toContain("Sommeil &amp; Récupération");
    expect(html).toContain("Nutrition &amp; Énergie");
    expect(html).toContain("Activité &amp; Mouvement");
  });

  it("propose les habitudes de santé clés issues du catalogue sans variables intimes", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 2 }));

    // Habitudes Sommeil
    expect(html).toContain("Coucher avant 23 h");
    expect(html).toContain("Chambre noire et fraîche");
    expect(html).toContain("Lecture 20 minutes");

    // Habitudes Nutrition
    expect(html).toContain("Limiter les sucres ajoutés");
    expect(html).toContain("Petit-déjeuner équilibré");
    expect(html).toContain("Suivi de la caféine");

    // Habitudes Activité
    expect(html).toContain("Course à pied / Running");
    expect(html).toContain("Renforcement musculaire");

    // Invariant: AUCUNE variable intime ou spécifique à Jérémy
    expect(html).not.toContain("Masturbation");
    expect(html).not.toContain("WHM");
  });

  it("fournit l'interface pour créer une habitude sur-mesure", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 2 }));

    expect(html).toContain("Ajouter une habitude sur-mesure");
    expect(html).toContain('placeholder="Ex. Méditation 10 min, Pas d&#x27;écran après 22 h…"');
    expect(html).toContain("Ajouter");
  });
});

describe("OnboardingForm - Slider de sommeil animé et accessible (Étape 3)", () => {
  it("remplace le texte fixe par un composant slider interactif aux pas de 15 minutes", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 3 }));

    expect(html).toContain("Poser votre base de sommeil");
    expect(html).toContain('type="range"');
    expect(html).toContain('min="300"');
    expect(html).toContain('max="660"');
    expect(html).toContain('step="15"');
    expect(html).toContain('aria-label="Objectif de sommeil"');
    expect(html).toContain('class="sleep-slider-value"');
    expect(html).toContain("8 h 30");
  });

  it("affiche dynamiquement la fourchette de tolérance", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 3 }));

    expect(html).toContain("Fourchette acceptée");
    expect(html).toContain("8 h 20 à 8 h 40");
  });

  it("expose des repères visuels discrets sur la jauge horaire", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 3 }));

    expect(html).toContain("5 h");
    expect(html).toContain("7 h");
    expect(html).toContain("8 h");
    expect(html).toContain("9 h");
    expect(html).toContain("11 h");
  });

  it("formate fidèlement les durées de sommeil", () => {
    expect(formatSleepDuration(300)).toBe("5 h 00");
    expect(formatSleepDuration(450)).toBe("7 h 30");
    expect(formatSleepDuration(465)).toBe("7 h 45");
    expect(formatSleepDuration(510)).toBe("8 h 30");
    expect(formatSleepDuration(660)).toBe("11 h 00");
  });
});

describe("OnboardingForm - Sortie sans montre connectée (Étape 4)", () => {
  it("met en valeur la sortie accueillante sans montre connectée avec le texte requis", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 4 }));

    expect(html).toContain("Connecter vos données de santé");
    expect(html).toContain("Pas de montre connectée ? Vous pouvez utiliser le journal quotidien et le suivi des repas dès aujourd&#x27;hui.");
    expect(html).toContain("class=\"no-watch-button\"");
    expect(html).toContain("Terminer sans connecter");
    expect(html).toContain("Enregistrer puis connecter Google Health");
  });
});
