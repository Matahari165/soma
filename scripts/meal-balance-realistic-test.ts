#!/usr/bin/env node

/**
 * Isolated, opt-in runner for realistic meal-balance fixtures.
 *
 * The fixture is deliberately not a database export. Each case describes the
 * same evidence that reaches the production analyser (a note and/or local
 * JPEG/PNG files). By default this runner only loads the fixture and performs
 * no provider call. `--live` or `MEAL_BALANCE_REALISTIC_LIVE=1` is required to
 * call the configured production provider chain.
 *
 * Raw result files contain only the canonical structured analysis returned by
 * that chain and non-sensitive case metadata. They do not contain the note,
 * image bytes/paths, request headers, provider payloads, or credentials.
 */

import { readFile, readdir, realpath, rename, stat, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { aggregateConfirmedMeals, type ConfirmedMealRecord, type MealDailyAggregate, type NutritionEstimate } from "@/domain/lab/meals";
import { mealOriginSchema, mealTypeSchema, MAX_MEAL_PHOTOS, validateMealAnalysis, type MealAnalysis, type MealOrigin, type MealType, type MealAnalysisCorrection } from "@/domain/meals";
import { DEFAULT_NUTRITION_TARGETS, parseNutritionTargets, type NutritionTargets } from "@/domain/nutrition-targets";
import { calculateMealBalanceScore, type MealBalanceGoalMode, type MealBalanceScore } from "@/domain/scores/meal-balance";
import { analyzeMealInputWithFallback, getMealAnalysisPipelineConfiguration, type MealAnalysisPipelineConfiguration } from "@/integrations/meal-analysis/provider-chain";
import { MealVisionError, isXaiVisionMimeType, type MealVisionInput } from "@/integrations/xai/meal-vision";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURE_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../tests/fixtures/meal-balance-realistic");
export const DEFAULT_RESULTS_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../analysis/private/meal-balance-realistic-results");
export const CANONICAL_RESULTS_DIRECTORY = resolve(DEFAULT_FIXTURE_DIRECTORY, "results");
export const REALISTIC_RUN_SCHEMA_VERSION = 2 as const;
export const REALISTIC_PIPELINE_IDENTITY = "meal-analysis-74c83bb-contract-v1" as const;
export const REALISTIC_PIPELINE_BASE_SHA = "74c83bb" as const;

/** Deliberate boundaries of this DB-free harness, rather than test assumptions. */
export const REALISTIC_RUNNER_LIMITATIONS = [
  "Les verrous, leases, idempotency keys et écritures D1/R2 de la route ne sont pas exercés.",
  "Les analyses réussies sont traitées comme confirmées uniquement pour l'adaptateur pur du score ; aucune confirmation n'est persistée.",
  "Les cibles effectives issues de l'effort et du profil ne sont pas chargées ; le fixture peut fournir des targets, sinon les cibles par défaut sont utilisées.",
  "Le contexte des recettes personnelles n'est pas chargé ; seules la note et les preuves photo du fixture alimentent le prompt.",
  "Les photos sont des compositions synthétiques contrôlées : elles permettent une revue visuelle réaliste sans constituer des données personnelles.",
  "Les fichiers de résultats contiennent l'analyse structurée canonique, pas l'enveloppe HTTP brute que le provider ne restitue pas à la production.",
] as const;

export type RealisticMealFixtureImage = {
  id?: string;
  /** A checked relative path for real local fixtures. */
  path?: string;
  /** Synthetic fixture reference; resolved to deterministic valid image bytes. */
  dataRef?: string;
  mimeType?: string;
  origin?: MealOrigin;
};

export type RealisticMealFixtureCase = {
  id: string;
  mealDate: string;
  mealType: MealType;
  origin: MealOrigin;
  note: string | null;
  correction?: MealAnalysisCorrection;
  images: RealisticMealFixtureImage[];
  mouthHeat: number | null;
  stomachOverfullness: number | null;
};

export type RealisticMealFixtureBundle = {
  version: number;
  targets: NutritionTargets;
  targetSource: "fixture" | "default";
  goalMode: MealBalanceGoalMode;
  cases: RealisticMealFixtureCase[];
};

export type RealisticCaseResult = {
  caseId: string;
  mealDate: string;
  mealType: MealType;
  inputMode: "text" | "photo" | "combined";
  status: "completed" | "failed" | "skipped";
  provider?: string;
  model?: string;
  analysis?: MealAnalysis;
  analysisProvenance?: {
    primary: { provider: string; model: string };
    final: { provider: string; model: string };
    validation: { requested: boolean; configured: boolean; attempted: boolean; succeeded: boolean; provider: string | null; model: string | null };
    fallback: { configured: boolean; attempted: boolean; used: boolean; provider: string | null; model: string | null };
  };
  /** Deliberately coarse and safe for logs; provider payloads are never kept. */
  errorCode?: string;
  reason?: "provider_not_requested" | "result_not_found" | "fixture_missing" | "fixture_empty";
};

export type RealisticRunResult = {
  schemaVersion: typeof REALISTIC_RUN_SCHEMA_VERSION;
  mode: "fixture_missing" | "offline" | "live" | "replay";
  fixtureDirectory: string;
  resultsDirectory: string;
  fixtureVersion: number | null;
  targetSource: "fixture" | "default" | null;
  goalMode: MealBalanceGoalMode | null;
  provenance: {
    baseSha: typeof REALISTIC_PIPELINE_BASE_SHA;
    pipelineIdentity: typeof REALISTIC_PIPELINE_IDENTITY;
    sourceHashes: Record<string, string>;
    primaryProvider: string;
    primaryModel: string;
    validatorConfigured: boolean;
    validatorProvider: string | null;
    validatorModel: string | null;
    fallbackConfigured: boolean;
    verificationRequested: boolean;
    configuration: ReturnType<typeof getMealAnalysisPipelineConfiguration>;
  };
  execution: { providerCalls: number; resumedCases: number; replayedCases: number };
  cases: RealisticCaseResult[];
  records: ConfirmedMealRecord[];
  aggregates: MealDailyAggregate[];
  scores: Array<{ date: string; score: MealBalanceScore }>;
};

export type RealisticRunOptions = {
  fixtureDirectory?: string;
  resultsDirectory?: string;
  live?: boolean;
  replay?: boolean;
  verify?: boolean;
  writeResults?: boolean;
  resume?: boolean;
  /** One-time, explicit attestation that v1 files used these exact fixture bytes and pipeline identity. */
  trustLegacyCache?: boolean;
};

type FixtureDocument = {
  version?: unknown;
  schemaVersion?: unknown;
  targets?: unknown;
  goalMode?: unknown;
  cases?: unknown;
  entries?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pathFromCwd(value: string) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

async function sha256File(path: string) {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

function pipelineConfigurationEntry(value: unknown): MealAnalysisPipelineConfiguration["primary"] | null {
  if (!isObject(value) || typeof value.provider !== "string" || !value.provider || typeof value.model !== "string" || !value.model || typeof value.endpoint !== "string" || !value.endpoint) return null;
  if (value.reasoningEffort !== null && typeof value.reasoningEffort !== "string") return null;
  return { provider: value.provider, model: value.model, endpoint: value.endpoint, reasoningEffort: value.reasoningEffort as string | null };
}

function recordedPipelineConfiguration(value: unknown): MealAnalysisPipelineConfiguration | null {
  if (!isObject(value) || !isObject(value.provenance)) return null;
  const rawConfiguration = value.provenance.configuration;
  if (!isObject(rawConfiguration)) return null;
  const primary = pipelineConfigurationEntry(rawConfiguration.primary);
  const validator = rawConfiguration.validator === null ? null : pipelineConfigurationEntry(rawConfiguration.validator);
  const fallback = rawConfiguration.fallback === null ? null : pipelineConfigurationEntry(rawConfiguration.fallback);
  if (!primary || (rawConfiguration.validator !== null && !validator) || (rawConfiguration.fallback !== null && !fallback)) return null;
  return { primary, validator, fallback };
}

const DEFAULT_REPLAY_PIPELINE_CONFIGURATION: MealAnalysisPipelineConfiguration = {
  primary: { provider: "xai", model: "grok-4.6", endpoint: "https://api.x.ai/v1/responses", reasoningEffort: null },
  validator: null,
  fallback: null,
};

async function runProvenance(
  verify: boolean | undefined,
  configurationOverride?: MealAnalysisPipelineConfiguration,
  verificationOverride?: boolean,
): Promise<RealisticRunResult["provenance"]> {
  const configuration = configurationOverride ?? getMealAnalysisPipelineConfiguration();
  const projectRoot = resolve(SCRIPT_DIRECTORY, "..");
  return {
    baseSha: REALISTIC_PIPELINE_BASE_SHA,
    pipelineIdentity: REALISTIC_PIPELINE_IDENTITY,
    sourceHashes: {
      promptAndNormalization: await sha256File(resolve(projectRoot, "src/integrations/xai/meal-vision.ts")),
      openAiAdapter: await sha256File(resolve(projectRoot, "src/integrations/openai/meal-vision.ts")),
      providerChain: await sha256File(resolve(projectRoot, "src/integrations/meal-analysis/provider-chain.ts")),
      analysisContract: await sha256File(resolve(projectRoot, "src/domain/meals.ts")),
      scoreEngine: await sha256File(resolve(projectRoot, "src/domain/scores/meal-balance.ts")),
      aggregationEngine: await sha256File(resolve(projectRoot, "src/domain/lab/meals.ts")),
    },
    primaryProvider: configuration.primary.provider,
    primaryModel: configuration.primary.model,
    validatorConfigured: Boolean(configuration.validator),
    validatorProvider: configuration.validator?.provider ?? null,
    validatorModel: configuration.validator?.model ?? null,
    fallbackConfigured: Boolean(configuration.fallback),
    verificationRequested: verificationOverride ?? verify !== false,
    configuration,
  };
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function safeCaseId(value: unknown, fileName: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value)) {
    throw new Error(`Fixture ${fileName}: id must be a safe non-sensitive filename identifier.`);
  }
  return value;
}

function nullableNote(value: unknown, fileName: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length > 500) throw new Error(`Fixture ${fileName}: note must be null or a string of at most 500 characters.`);
  return value.trim() || null;
}

function optionalCorrection(value: unknown, fileName: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 500) throw new Error(`Fixture ${fileName}: correction must contain 1–500 characters.`);
  return value.trim();
}

function intensity(value: unknown, fileName: string, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5) throw new Error(`Fixture ${fileName}: ${field} must be null or an integer from 0 to 5.`);
  return value;
}

function imageMimeType(path: string | undefined, supplied: unknown, fileName: string) {
  if (supplied !== undefined && (typeof supplied !== "string" || !isXaiVisionMimeType(supplied))) {
    throw new Error(`Fixture ${fileName}: image mimeType must be image/jpeg or image/png.`);
  }
  if (typeof supplied === "string") return supplied;
  const extension = path ? extname(path).toLowerCase() : "";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  throw new Error(`Fixture ${fileName}: image ${path} needs mimeType image/jpeg or image/png.`);
}

function parseImages(value: unknown, caseId: string, defaultOrigin: MealOrigin, fileName: string): RealisticMealFixtureImage[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_MEAL_PHOTOS) throw new Error(`Fixture ${fileName}: images must contain at most ${MAX_MEAL_PHOTOS} items.`);
  return value.map((item, index) => {
    const source = typeof item === "string" ? { path: item } : item;
    if (!isObject(source)) throw new Error(`Fixture ${fileName}: image ${index + 1} must be an object or a relative path.`);
    const path = typeof source.path === "string" && source.path.trim() ? source.path.trim() : undefined;
    const dataRef = typeof source.dataRef === "string" && source.dataRef.trim() ? source.dataRef.trim() : undefined;
    if ((!path && !dataRef) || (path && dataRef) || (path && isAbsolute(path))) {
      throw new Error(`Fixture ${fileName}: image ${index + 1} needs either a relative path or a synthetic dataRef.`);
    }
    if (dataRef && !dataRef.startsWith("synthetic://")) throw new Error(`Fixture ${fileName}: image dataRef must use synthetic://.`);
    return {
      id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : `${caseId}-photo-${index + 1}`,
      ...(path ? { path } : { dataRef }),
      mimeType: imageMimeType(path, source.mimeType, fileName),
      origin: source.origin === undefined ? defaultOrigin : mealOriginSchema.parse(source.origin),
    };
  });
}

function parseFixtureCase(value: unknown, fileName: string, index: number): RealisticMealFixtureCase {
  if (!isObject(value)) throw new Error(`Fixture ${fileName}: case ${index + 1} must be an object.`);
  const input = isObject(value.input) ? value.input : value;
  const id = safeCaseId(value.entryId ?? value.id ?? input.entryId ?? input.id, fileName);
  const mealDate = input.mealDate;
  if (!validDate(mealDate)) throw new Error(`Fixture ${fileName} (${id}): mealDate must be a valid YYYY-MM-DD date.`);
  const mealType = mealTypeSchema.safeParse(input.mealType);
  if (!mealType.success) throw new Error(`Fixture ${fileName} (${id}): mealType is invalid.`);
  const rawImages = Array.isArray(input.images) ? input.images : [];
  const imageOrigins = rawImages.flatMap((item) => isObject(item) && item.origin !== undefined ? [mealOriginSchema.parse(item.origin)] : []);
  const inferredOrigin = imageOrigins.length === 0 ? "unknown" : new Set(imageOrigins).size === 1 ? imageOrigins[0]! : "mixed";
  const origin = mealOriginSchema.safeParse(input.origin ?? value.origin ?? inferredOrigin);
  if (!origin.success) throw new Error(`Fixture ${fileName} (${id}): origin is invalid.`);
  const note = nullableNote(input.note, fileName);
  const correction = optionalCorrection(input.correction ?? value.correction, fileName);
  const images = parseImages(input.images, id, origin.data, fileName);
  if (!note && !images.length) throw new Error(`Fixture ${fileName} (${id}): provide a note or at least one image.`);
  return {
    id,
    mealDate,
    mealType: mealType.data,
    origin: origin.data,
    note,
    ...(correction ? { correction } : {}),
    images,
    mouthHeat: intensity(input.mouthHeat ?? value.mouthHeat, fileName, "mouthHeat"),
    stomachOverfullness: intensity(input.stomachOverfullness ?? value.stomachOverfullness, fileName, "stomachOverfullness"),
  };
}

function casesFromDocument(value: unknown, fileName: string): { cases: unknown[]; document: FixtureDocument | null } {
  if (Array.isArray(value)) return { cases: value, document: null };
  if (!isObject(value)) throw new Error(`Fixture ${fileName}: expected an object or an array.`);
  if (Array.isArray(value.cases)) return { cases: value.cases, document: value };
  if (Array.isArray(value.entries)) return { cases: value.entries, document: value };
  return { cases: [value], document: null };
}

async function readJson(path: string) {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`Could not read fixture JSON ${path}.`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Fixture JSON ${path} is not valid JSON.`);
  }
}

async function fixtureJsonFiles(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")).map((entry) => entry.name).sort((first, second) => first.localeCompare(second));
}

function documentTargets(document: FixtureDocument | null, fileName: string) {
  if (!document || document.targets === undefined) return { targets: DEFAULT_NUTRITION_TARGETS, targetSource: "default" as const };
  const targets = parseNutritionTargets(document.targets);
  if (!targets) throw new Error(`Fixture ${fileName}: targets are invalid.`);
  return { targets, targetSource: "fixture" as const };
}

function documentGoalMode(document: FixtureDocument | null, fileName: string): MealBalanceGoalMode {
  if (document?.goalMode === undefined) return "maintain";
  if (document.goalMode !== "maintain" && document.goalMode !== "build_muscle") throw new Error(`Fixture ${fileName}: goalMode must be maintain or build_muscle.`);
  return document.goalMode;
}

/** Load only fixture files; this function never contacts a provider or database. */
export async function loadRealisticMealFixture(directory = DEFAULT_FIXTURE_DIRECTORY): Promise<RealisticMealFixtureBundle | null> {
  const fixtureDirectory = pathFromCwd(directory);
  try {
    const directoryStat = await stat(fixtureDirectory);
    if (!directoryStat.isDirectory()) return null;
  } catch {
    return null;
  }
  const names = await fixtureJsonFiles(fixtureDirectory);
  if (!names.length) return { version: 1, targets: DEFAULT_NUTRITION_TARGETS, targetSource: "default", goalMode: "maintain", cases: [] };

  const manifestName = names.find((name) => ["index.json", "fixture.json", "cases.json"].includes(name.toLowerCase()));
  const selectedNames = manifestName ? [manifestName] : names;
  const parsedDocuments = await Promise.all(selectedNames.map(async (name) => {
    const document = await readJson(resolve(fixtureDirectory, name));
    return { name, ...casesFromDocument(document, name) };
  }));
  const metadataDocument = parsedDocuments.find((item) => item.document)?.document ?? null;
  const targetConfig = documentTargets(metadataDocument, manifestName ?? selectedNames[0] ?? "fixture.json");
  const goalMode = documentGoalMode(metadataDocument, manifestName ?? selectedNames[0] ?? "fixture.json");
  const cases = parsedDocuments.flatMap((item) => item.cases.map((fixtureCase, index) => parseFixtureCase(fixtureCase, item.name, index)));
  const ids = new Set<string>();
  for (const fixtureCase of cases) {
    if (ids.has(fixtureCase.id)) throw new Error(`Fixture case id ${fixtureCase.id} is duplicated.`);
    ids.add(fixtureCase.id);
  }
  const versionValue = metadataDocument?.version ?? metadataDocument?.schemaVersion;
  const version = versionValue === undefined ? 1 : versionValue;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new Error(`Fixture ${manifestName ?? "directory"}: version must be a positive integer.`);
  return { version, ...targetConfig, goalMode, cases };
}

async function fixtureRoot(directory: string) {
  const root = await realpath(directory);
  return root.endsWith("/") ? root : `${root}/`;
}

const SYNTHETIC_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SYNTHETIC_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAgY/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z";

function syntheticImageData(image: RealisticMealFixtureImage) {
  const base64 = image.mimeType === "image/png" ? SYNTHETIC_PNG_BASE64 : SYNTHETIC_JPEG_BASE64;
  return Uint8Array.from(Buffer.from(base64, "base64")).buffer;
}

async function imageData(directory: string, image: RealisticMealFixtureImage) {
  if (image.dataRef) return syntheticImageData(image);
  if (!image.path) throw new Error("Fixture image has neither path nor dataRef.");
  const root = await fixtureRoot(directory);
  const resolved = resolve(directory, image.path);
  const candidate = await realpath(resolved);
  const relativePath = relative(root, candidate);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error(`Fixture image ${image.path} is outside the fixture directory.`);
  const bytes = await readFile(candidate);
  return new Uint8Array(bytes).buffer;
}

async function mealVisionInput(directory: string, fixtureCase: RealisticMealFixtureCase): Promise<MealVisionInput> {
  const images = await Promise.all(fixtureCase.images.map(async (image) => ({
    id: image.id ?? `${fixtureCase.id}-photo`,
    mimeType: image.mimeType ?? "image/jpeg",
    origin: image.origin ?? fixtureCase.origin,
    data: await imageData(directory, image),
  })));
  return {
    mealType: fixtureCase.mealType,
    mealDate: fixtureCase.mealDate,
    note: fixtureCase.note,
    images,
    ...(fixtureCase.correction ? { correction: fixtureCase.correction } : {}),
  };
}

function nutritionEstimate(value: { low: number; likely: number; high: number } | null | undefined): NutritionEstimate | null {
  if (!value || !Number.isFinite(value.low) || !Number.isFinite(value.likely) || !Number.isFinite(value.high) || value.low < 0 || value.low > value.likely || value.likely > value.high) return null;
  return { low: value.low, likely: value.likely, high: value.high };
}

/**
 * Exact pure adapter used by the production `loadConfirmedMealRecords` path.
 * The harness marks the model output as confirmed only in this in-memory
 * projection so the real score can be evaluated; it never writes a meal row.
 */
export function confirmedMealRecordFromAnalysis(fixtureCase: RealisticMealFixtureCase, analysis: MealAnalysis): ConfirmedMealRecord {
  const totals = analysis.totals;
  return {
    id: fixtureCase.id,
    mealDate: fixtureCase.mealDate,
    mealType: fixtureCase.mealType,
    status: "confirmed",
    origin: fixtureCase.origin,
    caloriesKcal: nutritionEstimate(totals.calories),
    proteinG: nutritionEstimate(totals.proteinGrams),
    carbsG: nutritionEstimate(totals.carbohydrateGrams),
    fatG: nutritionEstimate(totals.fatGrams),
    fiberG: nutritionEstimate(totals.fiberGrams),
    sugarG: nutritionEstimate(totals.sugarGrams),
    addedSugarG: nutritionEstimate(totals.addedSugarGrams),
    foods: analysis.foods.map((food) => ({
      id: food.id,
      name: food.name,
      kind: food.kind,
      parentId: food.parentId,
      portion: food.portion ?? null,
      estimatedGrams: food.estimatedGrams ?? null,
      quantity: food.quantity ?? null,
      varietyKey: food.varietyKey ?? null,
      foodGroups: food.foodGroups,
      alcoholic: food.alcoholic,
      novaGroup: food.novaGroup,
      sugarExposure: food.sugarExposure,
      qualityProperties: food.qualityProperties,
      observation: food.observation,
      countedInTotals: food.countedInTotals,
      confidence: food.confidence,
    })),
    analysisConfidence: analysis.confidence,
    mouthHeat: fixtureCase.mouthHeat,
    stomachOverfullness: fixtureCase.stomachOverfullness,
    photoIds: fixtureCase.images.map((image) => image.id ?? "").filter(Boolean),
  };
}

function errorCode(error: unknown) {
  return error instanceof MealVisionError ? error.code : "unknown_analysis_error";
}

function resultFile(resultsDirectory: string, caseId: string) {
  return resolve(resultsDirectory, `${caseId}.json`);
}

async function readStoredRunArtifact(resultsDirectory: string) {
  try {
    return JSON.parse(await readFile(resolve(resultsDirectory, "run-result.json"), "utf8")) as unknown;
  } catch {
    return null;
  }
}

type StoredRawResult = {
  schemaVersion: typeof REALISTIC_RUN_SCHEMA_VERSION;
  caseId: string;
  mealDate: string;
  mealType: MealType;
  inputFingerprint: string;
  pipelineIdentity: typeof REALISTIC_PIPELINE_IDENTITY;
  provider: string;
  model: string;
  analysis: unknown;
  analysisProvenance: NonNullable<RealisticCaseResult["analysisProvenance"]>;
  migratedFromLegacy?: boolean;
};

function inputFingerprint(fixtureCase: RealisticMealFixtureCase, input: MealVisionInput, fixture: RealisticMealFixtureBundle, provenance: RealisticRunResult["provenance"]) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    pipelineIdentity: REALISTIC_PIPELINE_IDENTITY,
    provider: provenance.primaryProvider,
    model: provenance.primaryModel,
    validatorProvider: provenance.validatorProvider,
    validatorModel: provenance.validatorModel,
    fallbackConfigured: provenance.fallbackConfigured,
    verificationRequested: provenance.verificationRequested,
    sourceHashes: provenance.sourceHashes,
    configuration: provenance.configuration,
    targets: fixture.targets,
    targetSource: fixture.targetSource,
    goalMode: fixture.goalMode,
    mealDate: input.mealDate,
    mealType: input.mealType,
    origin: fixtureCase.origin,
    note: input.note,
    correction: input.correction ?? null,
    images: input.images.map((image) => ({ id: image.id, mimeType: image.mimeType, origin: image.origin })),
  }));
  for (const image of input.images) hash.update(new Uint8Array(image.data));
  return `sha256:${hash.digest("hex")}`;
}

async function readStoredRawResult(resultsDirectory: string, fixtureCase: RealisticMealFixtureCase, expectedFingerprint: string, expectedProvider: string, expectedModel: string, trustLegacyCache = false): Promise<StoredRawResult | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(resultFile(resultsDirectory, fixtureCase.id), "utf8")) as unknown;
  } catch {
    return null;
  }
  if (!isObject(value) || value.caseId !== fixtureCase.id || value.mealDate !== fixtureCase.mealDate || value.mealType !== fixtureCase.mealType || typeof value.provider !== "string" || typeof value.model !== "string") return null;
  const storedProvenance = isObject(value.analysisProvenance) ? value.analysisProvenance as StoredRawResult["analysisProvenance"] : null;
  const current = value.schemaVersion === REALISTIC_RUN_SCHEMA_VERSION && value.inputFingerprint === expectedFingerprint && value.pipelineIdentity === REALISTIC_PIPELINE_IDENTITY && storedProvenance;
  const attestedPriorCache = trustLegacyCache && value.schemaVersion === 1 && value.provider === expectedProvider && value.model === expectedModel;
  if (!current && !attestedPriorCache) return null;
  const analysisProvenance = storedProvenance ?? {
    primary: { provider: expectedProvider, model: expectedModel },
    final: { provider: expectedProvider, model: expectedModel },
    validation: { requested: true, configured: false, attempted: false, succeeded: false, provider: null, model: null },
    fallback: { configured: false, attempted: false, used: false, provider: null, model: null },
  };
  return { schemaVersion: REALISTIC_RUN_SCHEMA_VERSION, caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputFingerprint: expectedFingerprint, pipelineIdentity: REALISTIC_PIPELINE_IDENTITY, provider: value.provider, model: value.model, analysis: value.analysis, analysisProvenance, ...(attestedPriorCache ? { migratedFromLegacy: true } : {}) };
}

async function writeStoredRawResult(resultsDirectory: string, fixtureCase: RealisticMealFixtureCase, fingerprint: string, provider: string, model: string, analysis: MealAnalysis, analysisProvenance: NonNullable<RealisticCaseResult["analysisProvenance"]>) {
  await mkdir(resultsDirectory, { recursive: true });
  const output: StoredRawResult = { schemaVersion: REALISTIC_RUN_SCHEMA_VERSION, caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputFingerprint: fingerprint, pipelineIdentity: REALISTIC_PIPELINE_IDENTITY, provider, model, analysis, analysisProvenance };
  const destination = resultFile(resultsDirectory, fixtureCase.id);
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

/**
 * Re-key an existing canonical cache after a score-engine-only change.
 *
 * This is an explicit offline migration: it reads the already stored,
 * validated analyses, recomputes fingerprints with the current provenance,
 * and never invokes a provider. The subsequent replay remains the authority
 * for rewriting run-result.json with the new score version.
 */
export async function migrateRealisticMealBalanceCache(options: Pick<RealisticRunOptions, "fixtureDirectory" | "resultsDirectory" | "verify"> = {}) {
  const fixtureDirectory = pathFromCwd(options.fixtureDirectory ?? DEFAULT_FIXTURE_DIRECTORY);
  const resultsDirectory = pathFromCwd(options.resultsDirectory ?? CANONICAL_RESULTS_DIRECTORY);
  const fixture = await loadRealisticMealFixture(fixtureDirectory);
  if (!fixture) throw new Error("Cannot migrate a missing realistic meal fixture.");
  const artifact = await readStoredRunArtifact(resultsDirectory);
  const replayConfiguration = recordedPipelineConfiguration(artifact) ?? DEFAULT_REPLAY_PIPELINE_CONFIGURATION;
  const replayVerificationRequested = isObject(artifact) && isObject(artifact.provenance) && typeof artifact.provenance.verificationRequested === "boolean"
    ? artifact.provenance.verificationRequested
    : undefined;
  const provenance = await runProvenance(options.verify, replayConfiguration, replayVerificationRequested);
  let migratedCases = 0;
  for (const fixtureCase of fixture.cases) {
    const providerInput = await mealVisionInput(fixtureDirectory, fixtureCase);
    const fingerprint = inputFingerprint(fixtureCase, providerInput, fixture, provenance);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(resultFile(resultsDirectory, fixtureCase.id), "utf8")) as unknown;
    } catch {
      throw new Error(`Cannot migrate missing canonical result ${fixtureCase.id}.`);
    }
    if (!isObject(raw)
      || raw.schemaVersion !== REALISTIC_RUN_SCHEMA_VERSION
      || raw.caseId !== fixtureCase.id
      || raw.mealDate !== fixtureCase.mealDate
      || raw.mealType !== fixtureCase.mealType
      || raw.pipelineIdentity !== REALISTIC_PIPELINE_IDENTITY
      || typeof raw.provider !== "string"
      || typeof raw.model !== "string"
      || !isObject(raw.analysisProvenance)) {
      throw new Error(`Cannot migrate invalid canonical result ${fixtureCase.id}.`);
    }
    const analysis = validateMealAnalysis(raw.analysis);
    await writeStoredRawResult(resultsDirectory, fixtureCase, fingerprint, raw.provider, raw.model, analysis, raw.analysisProvenance as NonNullable<RealisticCaseResult["analysisProvenance"]>);
    migratedCases += 1;
  }
  return { migratedCases, sourceHashes: provenance.sourceHashes };
}

function scoreRecords(records: readonly ConfirmedMealRecord[], targets: NutritionTargets, goalMode: MealBalanceGoalMode) {
  const aggregates = aggregateConfirmedMeals(records);
  const scores = aggregates.map((day) => ({ date: day.date, score: calculateMealBalanceScore({ day, records, targets, goalMode }) }));
  return { aggregates, scores };
}

function inputMode(fixtureCase: RealisticMealFixtureCase): RealisticCaseResult["inputMode"] {
  return fixtureCase.images.length ? fixtureCase.note ? "combined" : "photo" : "text";
}

function skippedCase(fixtureCase: RealisticMealFixtureCase, reason: RealisticCaseResult["reason"]): RealisticCaseResult {
  return { caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputMode: inputMode(fixtureCase), status: "skipped", reason };
}

/**
 * Run the fixture without touching D1/R2. The provider is reachable only when
 * `live` is explicitly true (or the corresponding environment variable is
 * set by the CLI entry point).
 */
export async function runRealisticMealBalance(options: RealisticRunOptions = {}): Promise<RealisticRunResult> {
  const fixtureDirectory = pathFromCwd(options.fixtureDirectory ?? DEFAULT_FIXTURE_DIRECTORY);
  const live = options.live ?? enabled(process.env.MEAL_BALANCE_REALISTIC_LIVE);
  const replay = options.replay ?? enabled(process.env.MEAL_BALANCE_REALISTIC_REPLAY);
  const resultsDirectory = pathFromCwd(options.resultsDirectory ?? (replay ? CANONICAL_RESULTS_DIRECTORY : DEFAULT_RESULTS_DIRECTORY));
  const resume = options.resume ?? true;
  const trustLegacyCache = options.trustLegacyCache ?? enabled(process.env.MEAL_BALANCE_REALISTIC_TRUST_LEGACY_CACHE);
  if (live && replay) throw new Error("Choose either live mode or replay mode, not both.");
  const replayArtifact = replay ? await readStoredRunArtifact(resultsDirectory) : null;
  const replayConfiguration = replay
    ? recordedPipelineConfiguration(replayArtifact) ?? DEFAULT_REPLAY_PIPELINE_CONFIGURATION
    : undefined;
  const replayVerificationRequested = replay && options.verify === undefined && isObject(replayArtifact) && isObject(replayArtifact.provenance) && typeof replayArtifact.provenance.verificationRequested === "boolean"
    ? replayArtifact.provenance.verificationRequested
    : undefined;
  const provenance = await runProvenance(options.verify, replayConfiguration, replayVerificationRequested);
  const fixture = await loadRealisticMealFixture(fixtureDirectory);
  if (!fixture) {
    return {
      schemaVersion: REALISTIC_RUN_SCHEMA_VERSION,
      mode: "fixture_missing",
      fixtureDirectory: relative(process.cwd(), fixtureDirectory) || ".",
      resultsDirectory: relative(process.cwd(), resultsDirectory) || ".",
      fixtureVersion: null,
      targetSource: null,
      goalMode: null,
      provenance,
      execution: { providerCalls: 0, resumedCases: 0, replayedCases: 0 },
      cases: [],
      records: [],
      aggregates: [],
      scores: [],
    };
  }
  const mode = live ? "live" : replay ? "replay" : "offline";
  const cases: RealisticCaseResult[] = [];
  const records: ConfirmedMealRecord[] = [];
  const pendingLegacyMigrations: Array<() => Promise<void>> = [];
  let providerCalls = 0;
  let resumedCases = 0;
  let replayedCases = 0;
  for (const fixtureCase of fixture.cases) {
    if (!live && !replay) {
      cases.push(skippedCase(fixtureCase, fixture.cases.length ? "provider_not_requested" : "fixture_empty"));
      continue;
    }
    const providerInput = await mealVisionInput(fixtureDirectory, fixtureCase);
    const fingerprint = inputFingerprint(fixtureCase, providerInput, fixture, provenance);
    if (replay) {
      const stored = await readStoredRawResult(resultsDirectory, fixtureCase, fingerprint, provenance.primaryProvider, provenance.primaryModel, trustLegacyCache);
      if (!stored) {
        cases.push(skippedCase(fixtureCase, "result_not_found"));
        continue;
      }
      try {
        const analysis = validateMealAnalysis(stored.analysis);
        cases.push({ caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputMode: inputMode(fixtureCase), status: "completed", provider: stored.provider, model: stored.model, analysis, analysisProvenance: stored.analysisProvenance });
        replayedCases += 1;
        records.push(confirmedMealRecordFromAnalysis(fixtureCase, analysis));
        if (stored.migratedFromLegacy) pendingLegacyMigrations.push(() => writeStoredRawResult(resultsDirectory, fixtureCase, fingerprint, stored.provider, stored.model, analysis, stored.analysisProvenance));
      } catch {
        cases.push({ caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputMode: inputMode(fixtureCase), status: "failed", errorCode: "response_schema_error" });
      }
      continue;
    }
    if (resume) {
      const stored = await readStoredRawResult(resultsDirectory, fixtureCase, fingerprint, provenance.primaryProvider, provenance.primaryModel, trustLegacyCache);
      if (stored) {
        try {
          const analysis = validateMealAnalysis(stored.analysis);
          if (stored.migratedFromLegacy) await writeStoredRawResult(resultsDirectory, fixtureCase, fingerprint, stored.provider, stored.model, analysis, stored.analysisProvenance);
          cases.push({ caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputMode: inputMode(fixtureCase), status: "completed", provider: stored.provider, model: stored.model, analysis, analysisProvenance: stored.analysisProvenance });
          records.push(confirmedMealRecordFromAnalysis(fixtureCase, analysis));
          resumedCases += 1;
          continue;
        } catch {
          // A stale or invalid cached file is never trusted; the live provider
          // call below replaces it with a freshly validated canonical result.
        }
      }
    }
    try {
      providerCalls += 1;
      const analysed = await analyzeMealInputWithFallback(providerInput, { requestId: `realistic-${fixtureCase.id}`, verify: options.verify });
      const analysis = validateMealAnalysis(analysed.result);
      if (options.writeResults !== false) await writeStoredRawResult(resultsDirectory, fixtureCase, fingerprint, analysed.provider, analysed.model, analysis, analysed.provenance);
      cases.push({ caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputMode: inputMode(fixtureCase), status: "completed", provider: analysed.provider, model: analysed.model, analysis, ...(analysed.provenance ? { analysisProvenance: analysed.provenance } : {}) });
      records.push(confirmedMealRecordFromAnalysis(fixtureCase, analysis));
    } catch (error) {
      cases.push({ caseId: fixtureCase.id, mealDate: fixtureCase.mealDate, mealType: fixtureCase.mealType, inputMode: inputMode(fixtureCase), status: "failed", errorCode: errorCode(error) });
    }
  }
  if (replay && cases.some((item) => item.status !== "completed")) {
    throw new Error(`Replay incomplete: ${cases.filter((item) => item.status !== "completed").length} canonical result(s) missing or invalid; no artifact was written.`);
  }
  if (options.writeResults !== false) await Promise.all(pendingLegacyMigrations.map((migrate) => migrate()));
  const scored = scoreRecords(records, fixture.targets, fixture.goalMode);
  const aggregatesByDate = new Map(scored.aggregates.map((day) => [day.date, day]));
  const calendarDates = [...new Set(fixture.cases.map((fixtureCase) => fixtureCase.mealDate))].sort();
  const scores = calendarDates.map((date) => ({
    date,
    score: calculateMealBalanceScore({ day: aggregatesByDate.get(date), records, targets: fixture.targets, goalMode: fixture.goalMode }),
  }));
  const result: RealisticRunResult = {
    schemaVersion: REALISTIC_RUN_SCHEMA_VERSION,
    mode,
    fixtureDirectory: relative(process.cwd(), fixtureDirectory) || ".",
    resultsDirectory: relative(process.cwd(), resultsDirectory) || ".",
    fixtureVersion: fixture.version,
    targetSource: fixture.targetSource,
    goalMode: fixture.goalMode,
    provenance,
    execution: { providerCalls, resumedCases, replayedCases },
    cases,
    records,
    aggregates: scored.aggregates,
    scores,
  };
  if ((live || replay) && options.writeResults !== false) {
    await mkdir(resultsDirectory, { recursive: true });
    const destination = resolve(resultsDirectory, "run-result.json");
    const temporary = `${destination}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
  }
  return result;
}

function cliOptions(argv: readonly string[]): RealisticRunOptions {
  const options: RealisticRunOptions = {
    live: enabled(process.env.MEAL_BALANCE_REALISTIC_LIVE),
    replay: enabled(process.env.MEAL_BALANCE_REALISTIC_REPLAY),
  };
  for (const argument of argv) {
    if (argument === "--live") options.live = true;
    else if (argument === "--replay") options.replay = true;
    else if (argument === "--no-write") options.writeResults = false;
    else if (argument === "--no-resume") options.resume = false;
    else if (argument === "--trust-legacy-cache") options.trustLegacyCache = true;
    else if (argument.startsWith("--fixture=")) options.fixtureDirectory = argument.slice("--fixture=".length);
    else if (argument.startsWith("--results=")) options.resultsDirectory = argument.slice("--results=".length);
    else if (argument === "--no-verify") options.verify = false;
    else if (argument === "--help") throw new Error("Usage: --live (opt-in provider call), --replay, --fixture=PATH, --results=PATH, --no-write, --no-verify");
    else throw new Error(`Unknown option ${argument}. Use --help for usage.`);
  }
  if (options.live && options.replay) throw new Error("Choose either --live or --replay, not both.");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const result = await runRealisticMealBalance(cliOptions(argv));
  const completed = result.cases.filter((item) => item.status === "completed").length;
  const failed = result.cases.filter((item) => item.status === "failed").length;
  const skipped = result.cases.filter((item) => item.status === "skipped").length;
  console.log(JSON.stringify({ mode: result.mode, cases: result.cases.length, completed, failed, skipped, scoredDays: result.scores.length, resultsDirectory: result.resultsDirectory }));
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Meal balance runner failed.");
    process.exitCode = 1;
  });
}
