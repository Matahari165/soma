import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscobolusBackdrop } from "./discobolus-backdrop";
import { DiscobolusMainPreview } from "./discobolus-main-preview";
import { DISCOBOLUS_VARIANTS, isDiscobolusVariant } from "./discobolus-types";

describe("DiscobolusMainPreview", () => {
  it("renders the top bar with the 2 left flank artistic variants and the view toggle", () => {
    const html = renderToStaticMarkup(
      <DiscobolusMainPreview>
        <div id="test-content">Main Lab Content</div>
      </DiscobolusMainPreview>
    );

    expect(html).toContain("Discobole");
    expect(html).toContain("2 Variantes Flanc Gauche");
    expect(html).toContain("Voile Éthéré");
    expect(html).toContain("Bas-Relief");
    expect(html).toContain("✕ Off");
    expect(html).toContain("Page Principale");
    expect(html).toContain("Landing Page");
    expect(html).toContain("Main Lab Content");
  });

  it("renders the fixed Discobolus backdrop with left flank monumental variant by default", () => {
    const html = renderToStaticMarkup(
      <DiscobolusMainPreview>
        <div>Content</div>
      </DiscobolusMainPreview>
    );

    expect(html).toContain('data-statue-variant="monumental"');
    expect(html).toContain('data-placement="fixed"');
    expect(html).toContain("discobolus-left-monumental.png");
    // Retina 2x image in srcSet for ultra-crisp resolution
    expect(html).toContain("discobolus-left-monumental.png 2x");
  });

  it("renders the scroll layer for smooth parallax and fadeout animation", () => {
    const html = renderToStaticMarkup(
      <DiscobolusBackdrop variant="monumental" intensity="normal" />
    );

    // Verifies the presence of the dedicated scroll layer container
    expect(html).toContain("_statueScrollLayer_");
    expect(html).toContain("_statueWrapper_");
    expect(html).toContain("_statueShadowVeil_");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders pure white marble sculpture gradients without artificial green tint", () => {
    const html = renderToStaticMarkup(
      <DiscobolusBackdrop variant="superposed" intensity="normal" />
    );

    expect(html).toContain("marbleGradient");
    expect(html).toContain("#ffffff");
    expect(html).not.toContain("#48b376");
  });

  it("renders off mode without DOM nodes", () => {
    const html = renderToStaticMarkup(<DiscobolusBackdrop variant="off" />);
    expect(html).toBe("");
  });

  it("validates the 2 artistic variants and off metadata", () => {
    expect(DISCOBOLUS_VARIANTS.length).toBe(3); // 2 + off
    expect(isDiscobolusVariant("monumental")).toBe(true);
    expect(isDiscobolusVariant("superposed")).toBe(true);
    expect(isDiscobolusVariant("off")).toBe(true);
  });
});
