import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { MealBalanceScore } from "@/domain/scores/meal-balance";
import { CANONICAL_RESULTS_DIRECTORY, DEFAULT_FIXTURE_DIRECTORY, runRealisticMealBalance } from "../../scripts/meal-balance-realistic-test";

type CanonicalRunArtifact = {
  scores: Array<{ date: string; score: Pick<MealBalanceScore, "algorithmVersion" | "score" | "rawScore"> }>;
};

function scoreValues(scores: CanonicalRunArtifact["scores"]) {
  return scores.map(({ date, score }) => ({ date, algorithmVersion: score.algorithmVersion, score: score.score, rawScore: score.rawScore }));
}

describe("realistic meal-balance replay corpus", () => {
  it("revalidates all stored analyses and reproduces every daily score", async () => {
    const artifactPath = join(CANONICAL_RESULTS_DIRECTORY, "run-result.json");
    const artifactBefore = await readFile(artifactPath, "utf8");
    const canonical = JSON.parse(artifactBefore) as CanonicalRunArtifact;
    const result = await runRealisticMealBalance({ fixtureDirectory: DEFAULT_FIXTURE_DIRECTORY, replay: true, writeResults: false });
    const artifactAfter = await readFile(artifactPath, "utf8");

    expect(result.mode).toBe("replay");
    expect(result.cases).toHaveLength(38);
    expect(result.cases.filter((item) => item.status === "completed")).toHaveLength(38);
    expect(result.aggregates).toHaveLength(12);
    expect(result.scores).toHaveLength(12);
    expect(result.execution).toEqual({ providerCalls: 0, resumedCases: 0, replayedCases: 38 });
    expect(canonical.scores).toHaveLength(12);
    expect(scoreValues(result.scores)).toEqual(scoreValues(canonical.scores));
    expect(artifactAfter).toBe(artifactBefore);
  });

  it("replays independently of provider environment variables without network or writes", async () => {
    const artifactPath = join(CANONICAL_RESULTS_DIRECTORY, "run-result.json");
    const artifactBefore = await readFile(artifactPath, "utf8");
    const canonical = JSON.parse(artifactBefore) as CanonicalRunArtifact;
    const pollutedEnvironment = {
      OPENAI_API_KEY: "placeholder",
      OPENAI_MEAL_ANALYSIS_MODEL: "polluted-openai-analysis",
      OPENAI_MEAL_VALIDATOR_MODEL: "polluted-openai-validator",
      OPENAI_MEAL_ANALYSIS_REASONING_EFFORT: "xhigh",
      OPENAI_MEAL_VALIDATOR_REASONING_EFFORT: "max",
      OPENAI_RESPONSES_URL: "https://polluted-openai.invalid/v1/responses",
      XAI_API_KEY: "placeholder",
      XAI_MEAL_VISION_MODEL: "polluted-xai-analysis",
      XAI_MEAL_VALIDATOR_MODEL: "polluted-xai-validator",
      XAI_RESPONSES_URL: "https://polluted-xai.invalid/v1/responses",
      MEAL_ANALYSIS_PRIMARY_PROVIDER: "openai",
      MEAL_ANALYSIS_ENABLE_FALLBACK: "true",
    };
    const previousEnvironment = new Map<string, string | undefined>();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("Replay must not call the network.");
    });

    try {
      for (const [key, value] of Object.entries(pollutedEnvironment)) {
        previousEnvironment.set(key, process.env[key]);
        process.env[key] = value;
      }

      const result = await runRealisticMealBalance({ fixtureDirectory: DEFAULT_FIXTURE_DIRECTORY, replay: true, writeResults: false });

      expect(result.cases).toHaveLength(38);
      expect(result.cases.every((item) => item.status === "completed")).toBe(true);
      expect(result.scores).toHaveLength(12);
      expect(scoreValues(result.scores)).toEqual(scoreValues(canonical.scores));
      expect(result.execution).toEqual({ providerCalls: 0, resumedCases: 0, replayedCases: 38 });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fetchSpy.mockRestore();
    }

    expect(await readFile(artifactPath, "utf8")).toBe(artifactBefore);
  });
});
