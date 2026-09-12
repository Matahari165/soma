import { afterEach, describe, expect, it } from "vitest";

import { GET, PUT } from "./route";

describe("nutrition targets API local preview", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("reads and writes targets for the current preview user", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const update = await PUT(new Request("https://soma.example/api/nutrition-targets", {
      method: "PUT",
      body: JSON.stringify({ targets: { caloriesKcal: { low: 3000, likely: 3200, high: 3400 }, proteinG: { low: 150, likely: 170, high: 190 }, fatG: { low: 70, likely: 80, high: 90 }, carbsG: { low: 350, likely: 400, high: 450 }, fiberG: { low: 25, likely: 30, high: 35 }, surplusKcal: 300 } }),
      headers: { "content-type": "application/json" },
    }));
    expect(update.status).toBe(200);
    expect((await update.json()).targets.caloriesKcal.likely).toBe(3200);
    const loaded = await GET();
    expect(loaded.status).toBe(200);
    const body = await loaded.json();
    expect(body.targets.proteinG.likely).toBe(170);
    expect(body.effectiveTargets.caloriesKcal.likely).toBe(3250);
  });

  it("rejects an inverted range", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const response = await PUT(new Request("https://soma.example/api/nutrition-targets", {
      method: "PUT",
      body: JSON.stringify({ targets: { caloriesKcal: { low: 3400, likely: 3200, high: 3000 } } }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
  });
});
