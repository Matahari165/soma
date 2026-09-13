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
      resultsDirectory: "docs/testing/meal-balance-realistic-results/raw",
    });

    await mkdir("docs/testing/meal-balance-realistic-results", { recursive: true });
    await writeFile(
      "docs/testing/meal-balance-realistic-results/run-summary.json",
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );

    expect(result.mode).toBe("live");
    expect(result.cases).toHaveLength(38);
    expect(result.cases.some((item) => item.status === "completed")).toBe(true);
  }, 30 * 60_000);
});
