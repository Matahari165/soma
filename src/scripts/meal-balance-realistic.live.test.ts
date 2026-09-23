import { mkdir, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { runRealisticMealBalance } from "../../scripts/meal-balance-realistic-test";

const live = process.env.MEAL_BALANCE_REALISTIC_LIVE === "1";

describe.skipIf(!live)("realistic meal-balance live provider run", () => {
  it("analyses the synthetic fixture through the production provider chain", async () => {
    const result = await runRealisticMealBalance({
      live: true,
      verify: true,
      fixtureDirectory: "tests/fixtures/meal-balance-realistic",
      resultsDirectory: "analysis/private/meal-balance-realistic-live/raw",
    });

    await mkdir("analysis/private/meal-balance-realistic-live", { recursive: true });
    await writeFile(
      "analysis/private/meal-balance-realistic-live/run-summary.json",
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );

    expect(result.mode).toBe("live");
    expect(result.cases).toHaveLength(38);
    expect(result.cases.some((item) => item.status === "completed")).toBe(true);
  }, 30 * 60_000);
});
