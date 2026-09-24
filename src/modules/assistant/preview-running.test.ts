import { describe, expect, it } from "vitest";

import { previewRunningContext } from "./preview-running";

describe("preview running data", () => {
  it("provides dated sessions and consistent seven-day aggregates without real account data", () => {
    const context = previewRunningContext(new Date("2026-09-24T12:00:00Z"));

    expect(context).toContain("Courses fictives de démonstration");
    expect(context).toContain("2026-09-04 au 2026-09-10");
    expect(context).toContain("2026-09-11 au 2026-09-17");
    expect(context).toContain("2026-09-18 au 2026-09-24");
    expect(context).toContain("3 séances, 15 km, 98 min, allure moyenne pondérée 6:32/km");
    expect(context).toContain("3 séances, 18,3 km, 117 min, allure moyenne pondérée 6:24/km");
    expect(context).toContain("3 séances, 21 km, 129 min, allure moyenne pondérée 6:09/km");
    expect(context).toContain("2026-09-22 : 7 km, 43 min, 6:09/km, FC moyenne 147 bpm");
    expect(context.match(/FC moyenne \d+ bpm/g)).toHaveLength(9);
    expect(context).toContain("ne proviennent pas du compte utilisateur");
  });
});
