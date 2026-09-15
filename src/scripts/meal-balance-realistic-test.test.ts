import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeMealInputWithFallback, getMealAnalysisPipelineConfiguration } from "@/integrations/meal-analysis/provider-chain";
import {
  confirmedMealRecordFromAnalysis,
  DEFAULT_FIXTURE_DIRECTORY,
  loadRealisticMealFixture,
  migrateRealisticMealBalanceCache,
  REALISTIC_RUN_SCHEMA_VERSION,
  runRealisticMealBalance,
} from "../../scripts/meal-balance-realistic-test";

vi.mock("@/integrations/meal-analysis/provider-chain", () => ({
  analyzeMealInputWithFallback: vi.fn(),
  getMealAnalysisPipelineConfiguration: vi.fn(),
}));

const mockedProviderChain = vi.mocked(analyzeMealInputWithFallback);
const mockedPipelineConfiguration = vi.mocked(getMealAnalysisPipelineConfiguration);
const temporaryDirectories: string[] = [];

function pipelineConfiguration(endpoint = "https://api.x.ai/v1/responses") {
  return {
    primary: { provider: "xai", model: "grok-4.6", endpoint, reasoningEffort: null },
    validator: null,
    fallback: null,
  };
}

function analysis() {
  const range = { low: 400, likely: 500, high: 650 };
  return {
    summary: "Un bol de riz avec légumes.",
    dishType: "Bowl",
    calorieAnalysis: "Environ 500 kcal, un repas modéré.",
    foods: [{
      id: "food-1",
      name: "Riz",
      preparation: "cuit",
      portion: "un bol",
      estimatedGrams: 250,
      kind: "ingredient" as const,
      parentId: null,
      course: "main" as const,
      countedInTotals: true,
      foodGroups: ["refined_grain" as const],
      varietyKey: "riz",
      alcoholic: false,
      novaGroup: 1 as const,
      sugarExposure: { concentrated: false, liquid: false },
      qualityProperties: ["minimally_processed" as const],
      observation: {
        portion: "observed" as const,
        novaGroup: "observed" as const,
        sugarExposure: "none_observed" as const,
        qualityProperties: "observed" as const,
        confidence: { portion: "medium" as const, novaGroup: "low" as const, sugarExposure: "medium" as const, qualityProperties: "medium" as const },
      },
      evidence: "visible" as const,
      evidenceSource: "note" as const,
      evidencePhotoIds: [],
      quantity: { value: 250, unit: "g", basis: "description", grams: 250 },
      calories: range,
      proteinGrams: { low: 20, likely: 28, high: 36 },
      carbohydrateGrams: { low: 65, likely: 80, high: 100 },
      fatGrams: { low: 12, likely: 18, high: 25 },
      fiberGrams: { low: 4, likely: 7, high: 10 },
      sugarGrams: { low: 0, likely: 2, high: 8 },
      addedSugarGrams: { low: 0, likely: 0, high: 2 },
      confidence: "medium" as const,
    }],
    totals: {
      calories: range,
      proteinGrams: { low: 20, likely: 28, high: 36 },
      carbohydrateGrams: { low: 65, likely: 80, high: 100 },
      fatGrams: { low: 12, likely: 18, high: 25 },
      fiberGrams: { low: 4, likely: 7, high: 10 },
      sugarGrams: { low: 0, likely: 2, high: 8 },
      addedSugarGrams: { low: 0, likely: 0, high: 2 },
    },
    confidence: "medium" as const,
    uncertainties: ["La quantité d'huile n'est pas visible."],
    uncertaintySignals: [{ code: "sauce_or_oil_unknown" as const, field: "sauceOrOil" as const, foodId: "food-1", severity: "medium" as const, detail: "La quantité d'huile n'est pas visible." }],
  };
}

function providerResult(provider = "stub-production-chain", model = "stub-model") {
  const validation = { requested: true, configured: false, attempted: false, succeeded: false, provider: null, model: null };
  return {
    result: analysis(),
    provider,
    model,
    validation,
    provenance: {
      promptVersion: "2026-09-01",
      schemaVersion: "2026-09-01",
      primary: { provider, model },
      final: { provider, model },
      validation,
      fallback: { configured: false, attempted: false, used: false, provider: null, model: null },
    },
  };
}

async function fixtureDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "soma-meal-balance-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeFixture(directory: string) {
  await writeFile(join(directory, "fixture.json"), JSON.stringify({
    version: 1,
    cases: [{ id: "case-lunch", mealDate: "2026-09-12", mealType: "lunch", origin: "homemade", note: "Bol de riz", images: [] }],
  }));
}

afterEach(async () => {
  mockedProviderChain.mockReset();
  mockedPipelineConfiguration.mockReset();
  mockedPipelineConfiguration.mockReturnValue(pipelineConfiguration());
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("realistic meal-balance runner", () => {
  mockedPipelineConfiguration.mockReturnValue(pipelineConfiguration());
  it("loads the dataset entries contract and sends controlled synthetic photos at the provider boundary", async () => {
    const resultsDirectory = await fixtureDirectory();
    const loaded = await loadRealisticMealFixture(DEFAULT_FIXTURE_DIRECTORY);

    expect(loaded?.cases).toHaveLength(38);
    expect(loaded?.cases.find((item) => item.id === "d05-lunch")?.origin).toBe("mixed");
    expect(loaded?.cases.every((item) => item.images.every((image) => image.path?.startsWith("images/") || image.dataRef?.startsWith("synthetic://")) || item.images.length === 0)).toBe(true);

    mockedProviderChain.mockResolvedValue(providerResult());
    const result = await runRealisticMealBalance({ fixtureDirectory: DEFAULT_FIXTURE_DIRECTORY, resultsDirectory, live: true });

    expect(mockedProviderChain).toHaveBeenCalledTimes(38);
    expect(mockedProviderChain.mock.calls[0]?.[0]).toMatchObject({ mealType: "breakfast", mealDate: "2026-09-01", note: expect.any(String), images: [{ id: "d01-breakfast-photo-1", mimeType: "image/jpeg", origin: "homemade" }] });
    expect((mockedProviderChain.mock.calls[0]?.[0].images[0]?.data as ArrayBuffer).byteLength).toBeGreaterThan(100);
    expect(result.aggregates).toHaveLength(12);
    expect(result.scores).toHaveLength(12);
  });

  it("does not contact a provider when live mode was not explicitly requested", async () => {
    const fixture = await fixtureDirectory();
    await writeFixture(fixture);

    const result = await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory: join(fixture, "results") });

    expect(result.mode).toBe("offline");
    expect(result.cases).toEqual([{ caseId: "case-lunch", mealDate: "2026-09-12", mealType: "lunch", inputMode: "text", status: "skipped", reason: "provider_not_requested" }]);
    expect(result.records).toHaveLength(0);
    expect(mockedProviderChain).not.toHaveBeenCalled();
  });

  it("returns an explicit no-op when the future fixture directory is absent", async () => {
    const fixture = join(await fixtureDirectory(), "missing");
    const result = await runRealisticMealBalance({ fixtureDirectory: fixture, live: true });

    expect(result.mode).toBe("fixture_missing");
    expect(result.cases).toHaveLength(0);
    expect(mockedProviderChain).not.toHaveBeenCalled();
  });

  it("uses the production provider chain only in live mode, persists raw analysis, and scores through production adapters", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult());

    const result = await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });

    expect(mockedProviderChain).toHaveBeenCalledTimes(1);
    expect(mockedProviderChain).toHaveBeenCalledWith(expect.objectContaining({ mealType: "lunch", mealDate: "2026-09-12", note: "Bol de riz", images: [] }), expect.objectContaining({ requestId: "realistic-case-lunch" }));
    expect(result.cases[0]).toMatchObject({ caseId: "case-lunch", status: "completed", provider: "stub-production-chain", model: "stub-model" });
    expect(result.records).toHaveLength(1);
    expect(result.aggregates[0]).toMatchObject({ date: "2026-09-12", mealCount: 1, caloriesKcal: 500, foodVarietyCount: 1 });
    expect(result.scores[0]?.score.algorithmVersion).toBe("meal-balance-v3");
    expect(result.scores[0]?.score.score).toEqual(expect.any(Number));

    const saved = JSON.parse(await readFile(join(resultsDirectory, "case-lunch.json"), "utf8")) as Record<string, unknown>;
    expect(saved).toMatchObject({ schemaVersion: 2, caseId: "case-lunch", pipelineIdentity: "meal-analysis-74c83bb-contract-v1", inputFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/), provider: "stub-production-chain", model: "stub-model", analysis: { summary: "Un bol de riz avec légumes." } });
    expect(saved).not.toHaveProperty("note");
    expect(saved).not.toHaveProperty("images");
    const fullRun = JSON.parse(await readFile(join(resultsDirectory, "run-result.json"), "utf8")) as Record<string, unknown>;
    expect(fullRun).toMatchObject({ mode: "live", cases: [{ caseId: "case-lunch", inputMode: "text", status: "completed" }], scores: [{ date: "2026-09-12" }] });
  });

  it("keeps every fixture date visible when provider calls fail", async () => {
    const fixture = await fixtureDirectory();
    await writeFile(join(fixture, "fixture.json"), JSON.stringify({
      version: 1,
      cases: [
        { id: "day-one", mealDate: "2026-09-11", mealType: "lunch", origin: "homemade", note: "Repas un", images: [] },
        { id: "day-two", mealDate: "2026-09-12", mealType: "dinner", origin: "prepared", note: "Repas deux", images: [] },
      ],
    }));
    mockedProviderChain.mockRejectedValue(new Error("provider down"));

    const result = await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory: join(fixture, "results"), live: true });

    expect(result.scores).toHaveLength(2);
    expect(result.scores.map((day) => [day.date, day.score.score, day.score.status])).toEqual([
      ["2026-09-11", null, "insufficient"],
      ["2026-09-12", null, "insufficient"],
    ]);
  });

  it("replays only a previously saved canonical analysis and still uses the same score path", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult());
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    mockedProviderChain.mockReset();

    const replay = await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, replay: true });

    expect(replay.mode).toBe("replay");
    expect(replay.cases[0]).toMatchObject({ status: "completed", provider: "stub-production-chain" });
    expect(replay.scores[0]?.score.algorithmVersion).toBe("meal-balance-v3");
    expect(mockedProviderChain).not.toHaveBeenCalled();
  });

  it("valide caseId, date, type et schema avant la réécriture de migration offline", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult());
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    mockedProviderChain.mockReset();

    const resultPath = join(resultsDirectory, "case-lunch.json");
    const canonical = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
    const invalidVariants: Array<[string, unknown]> = [
      ["caseId", "case-other"],
      ["mealDate", "2026-09-11"],
      ["mealType", "dinner"],
      ["schemaVersion", REALISTIC_RUN_SCHEMA_VERSION - 1],
    ];
    for (const [field, value] of invalidVariants) {
      const invalid = { ...canonical, [field]: value };
      const serialized = `${JSON.stringify(invalid, null, 2)}\n`;
      await writeFile(resultPath, serialized, "utf8");
      await expect(migrateRealisticMealBalanceCache({ fixtureDirectory: fixture, resultsDirectory })).rejects.toThrow();
      expect(await readFile(resultPath, "utf8")).toBe(serialized);
    }

    const stale = { ...canonical, inputFingerprint: `sha256:${"0".repeat(64)}` };
    await writeFile(resultPath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");
    const migrated = await migrateRealisticMealBalanceCache({ fixtureDirectory: fixture, resultsDirectory });
    const saved = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;

    expect(migrated.migratedCases).toBe(1);
    expect(saved).toMatchObject({ schemaVersion: REALISTIC_RUN_SCHEMA_VERSION, caseId: "case-lunch", mealDate: "2026-09-12", mealType: "lunch" });
    expect(saved.inputFingerprint).not.toBe(stale.inputFingerprint);
    expect(mockedProviderChain).not.toHaveBeenCalled();
  });

  it("fails an incomplete replay before preserving the last complete run artifact", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    await writeFile(join(fixture, "fixture.json"), JSON.stringify({
      version: 1,
      cases: [
        { id: "case-lunch", mealDate: "2026-09-12", mealType: "lunch", origin: "homemade", note: "Bol de riz", images: [] },
        { id: "case-dinner", mealDate: "2026-09-12", mealType: "dinner", origin: "homemade", note: "Soupe", images: [] },
      ],
    }));
    mockedProviderChain.mockResolvedValue(providerResult());
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    const artifactPath = join(resultsDirectory, "run-result.json");
    const completeArtifact = await readFile(artifactPath, "utf8");
    await rm(join(resultsDirectory, "case-dinner.json"));

    await expect(runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, replay: true })).rejects.toThrow("Replay incomplete: 1 canonical result(s) missing or invalid; no artifact was written.");

    expect(await readFile(artifactPath, "utf8")).toBe(completeArtifact);
  });

  it("resumes a live run from validated stored results without another provider call", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult());
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    mockedProviderChain.mockReset();

    const resumed = await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });

    expect(resumed.cases[0]).toMatchObject({ status: "completed", provider: "stub-production-chain" });
    expect(mockedProviderChain).not.toHaveBeenCalled();
  });

  it("invalidates a stored result when the source evidence changes", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult());
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    mockedProviderChain.mockClear();
    await writeFile(join(fixture, "fixture.json"), JSON.stringify({
      version: 1,
      cases: [{ id: "case-lunch", mealDate: "2026-09-12", mealType: "lunch", origin: "homemade", note: "Bol de riz et haricots", images: [] }],
    }));

    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });

    expect(mockedProviderChain).toHaveBeenCalledTimes(1);
    expect(mockedProviderChain).toHaveBeenCalledWith(expect.objectContaining({ note: "Bol de riz et haricots" }), expect.any(Object));
  });

  it("invalidates a stored result when an influential provider endpoint changes", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult("xai", "grok-4.6"));
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    mockedProviderChain.mockClear();
    mockedPipelineConfiguration.mockReturnValue(pipelineConfiguration("https://synthetic-alternate.invalid/v1/responses"));

    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });

    expect(mockedProviderChain).toHaveBeenCalledTimes(1);
  });

  it("migrates a legacy cache only after an explicit evidence attestation", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult("xai", "grok-4.6"));
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    const path = join(resultsDirectory, "case-lunch.json");
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    delete stored.inputFingerprint;
    delete stored.pipelineIdentity;
    stored.schemaVersion = 1;
    await writeFile(path, JSON.stringify(stored));
    mockedProviderChain.mockClear();

    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true, trustLegacyCache: true });

    expect(mockedProviderChain).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ schemaVersion: 2, inputFingerprint: expect.stringMatching(/^sha256:/) });
  });

  it("never trusts a stale v2 cache as legacy even with explicit legacy attestation", async () => {
    const fixture = await fixtureDirectory();
    const resultsDirectory = join(fixture, "results");
    await writeFixture(fixture);
    mockedProviderChain.mockResolvedValue(providerResult("xai", "grok-4.6"));
    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true });
    const path = join(resultsDirectory, "case-lunch.json");
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    stored.inputFingerprint = "sha256:stale-v2-fingerprint";
    await writeFile(path, JSON.stringify(stored));
    mockedProviderChain.mockClear();

    await runRealisticMealBalance({ fixtureDirectory: fixture, resultsDirectory, live: true, trustLegacyCache: true });

    expect(mockedProviderChain).toHaveBeenCalledTimes(1);
  });

  it("maps an analysis to a confirmed record without turning unknown nutrition into zero", async () => {
    const fixture = await fixtureDirectory();
    await writeFixture(fixture);
    const loaded = await loadRealisticMealFixture(fixture);
    expect(loaded).not.toBeNull();
    const record = confirmedMealRecordFromAnalysis(loaded!.cases[0]!, { ...analysis(), totals: { ...analysis().totals, fiberGrams: null } });

    expect(record.fiberG).toBeNull();
    expect(record.addedSugarG).toEqual({ low: 0, likely: 0, high: 2 });
  });
});
