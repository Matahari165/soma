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

describe("OnboardingForm - Architecture and steps", () => {
  it("presents 5 steps in canonical order", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 0 }));

    expect(html).toContain("Profile");
    expect(html).toContain("Goal");
    expect(html).toContain("Habits");
    expect(html).toContain("Sleep");
    expect(html).toContain("Health Data");
  });

  it("renders profile fields on step 0", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 0 }));

    expect(html).toContain("About you");
    expect(html).toContain("Name");
    expect(html).toContain("Date of birth");
    expect(html).toContain("Height (cm)");
    expect(html).toContain("Weight (kg)");
  });

  it("renders goal choices on step 1", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 1 }));

    expect(html).toContain("What is your primary goal?");
    expect(html).toContain("Build muscle");
    expect(html).toContain("Improve endurance");
    expect(html).toContain("Secondary goal (optional)");
  });
});

describe("OnboardingForm - Healthy habits catalogue (Step 2)", () => {
  it("renders 3 habit categories with clear titles", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 2 }));

    expect(html).toContain("Your health habits");
    expect(html).toContain("Sleep &amp; Recovery");
    expect(html).toContain("Nutrition &amp; Fuel");
    expect(html).toContain("Movement &amp; Training");
  });

  it("offers key health habits without intimate variables", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 2 }));

    // Sleep habits
    expect(html).toContain("Bedtime before 11 PM");
    expect(html).toContain("Dark, cool bedroom");
    expect(html).toContain("Reading for 20 minutes");

    // Nutrition habits
    expect(html).toContain("Limit added sugars");
    expect(html).toContain("Balanced breakfast");
    expect(html).toContain("Caffeine tracking");

    // Activity habits
    expect(html).toContain("Running");
    expect(html).toContain("Strength training");

    // Invariant: NO intimate or user-specific variables
    expect(html).not.toContain("Masturbation");
    expect(html).not.toContain("WHM");
  });

  it("provides interface to create a custom habit", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 2 }));

    expect(html).toContain("Add a custom habit");
    expect(html).toContain("e.g. Meditation 10 min, No screens after 10 PM…");
    expect(html).toContain("Add");
  });
});

describe("OnboardingForm - Sleep slider (Step 3)", () => {
  it("renders interactive slider with 15-minute steps", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 3 }));

    expect(html).toContain("Set your sleep baseline");
    expect(html).toContain('type="range"');
    expect(html).toContain('min="300"');
    expect(html).toContain('max="660"');
    expect(html).toContain('step="15"');
    expect(html).toContain('aria-label="Sleep target"');
    expect(html).toContain('class="sleep-slider-value"');
    expect(html).toContain("8h 30m");
  });

  it("dynamically displays tolerance window", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 3 }));

    expect(html).toContain("Accepted range");
    expect(html).toContain("8h 20m to 8h 40m");
  });

  it("displays discrete visual ticks on the gauge", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 3 }));

    expect(html).toContain("5h");
    expect(html).toContain("7h");
    expect(html).toContain("8h");
    expect(html).toContain("9h");
    expect(html).toContain("11h");
  });

  it("formats sleep durations accurately", () => {
    expect(formatSleepDuration(300)).toBe("5h 00m");
    expect(formatSleepDuration(450)).toBe("7h 30m");
    expect(formatSleepDuration(465)).toBe("7h 45m");
    expect(formatSleepDuration(510)).toBe("8h 30m");
    expect(formatSleepDuration(660)).toBe("11h 00m");
  });
});

describe("OnboardingForm - No connected watch option (Step 4)", () => {
  it("highlights welcoming option without smartwatch", () => {
    const html = renderToStaticMarkup(createElement(OnboardingForm, { initialDisplayName: "Alexandre", initialStep: 4 }));

    expect(html).toContain("Connect your health data");
    expect(html).toContain("No connected watch? You can start using your daily journal and meal tracking today.");
    expect(html).toContain("class=\"no-watch-button\"");
    expect(html).toContain("Continue without connecting");
    expect(html).toContain("Save and connect Google Health");
  });
});
