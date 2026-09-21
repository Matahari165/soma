import { describe, expect, it } from "vitest";

import { OBSERVATORY_MOTION_EASING, OBSERVATORY_MOTION_KEYFRAMES, OBSERVATORY_MOTION_SELECTOR } from "./observatory-page-motion";

describe("observatory page motion contract", () => {
  it("covers the five primary Observatory surfaces with one selector", () => {
    expect(OBSERVATORY_MOTION_SELECTOR).toContain(".lab-world > section");
    expect(OBSERVATORY_MOTION_SELECTOR).toContain(".meals-page-journal");
    expect(OBSERVATORY_MOTION_SELECTOR).toContain(".health-detail-page .health-observatory-panel");
  });

  it("uses one calm settling movement without blur, clipping or scale", () => {
    expect(OBSERVATORY_MOTION_EASING).toBe("cubic-bezier(.16,1,.3,1)");
    expect(JSON.stringify(OBSERVATORY_MOTION_KEYFRAMES)).not.toMatch(/blur|clipPath|scale/);
    expect(OBSERVATORY_MOTION_KEYFRAMES.at(-1)).toMatchObject({ opacity: 1, transform: "translateY(0)" });
  });
});
