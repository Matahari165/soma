import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claimCloudflareLock: vi.fn(),
  claimCloudflareLockWithToken: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  refreshCloudflareLockWithToken: vi.fn(),
  releaseCloudflareLock: vi.fn(),
  releaseCloudflareLockWithToken: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/cloudflare/db", () => ({
  claimCloudflareLock: state.claimCloudflareLock,
  claimCloudflareLockWithToken: state.claimCloudflareLockWithToken,
  createCloudflareAdminClient: () => ({ from: state.from }),
  refreshCloudflareLockWithToken: state.refreshCloudflareLockWithToken,
  releaseCloudflareLock: state.releaseCloudflareLock,
  releaseCloudflareLockWithToken: state.releaseCloudflareLockWithToken,
}));

import { ensureJournalVariables, loadJournalData, variableFromRow, type JournalVariableRow } from "./journal";

function query(data: unknown[] = []) {
  const builder = {} as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    insert: typeof state.insert;
    update: typeof state.update;
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  };
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.lte = vi.fn(() => builder);
  builder.insert = vi.fn((rows) => {
    state.insert(rows);
    return Promise.resolve({ error: null });
  });
  builder.update = vi.fn((updates) => {
    state.update(updates);
    return Promise.resolve({ error: null });
  });
  builder.then = (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.from.mockImplementation(() => query());
});

function row(overrides: Partial<JournalVariableRow> = {}): JournalVariableRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Caffeine",
    variable_type: "number",
    unit: "mg",
    options: [],
    position: 30,
    is_active: undefined,
    emoji: "☕",
    default_value: 0,
    day_period: "day",
    ...overrides,
  };
}

describe("journal variable compatibility", () => {
  it("keeps legacy D1 variables active when the flag is missing", () => {
    expect(variableFromRow(row()).isActive).toBe(true);
  });

  it("respects an explicit archive flag", () => {
    expect(variableFromRow(row({ is_active: false })).isActive).toBe(false);
  });

  it("preserves the explicit automatic source configuration", () => {
    const bedtime = variableFromRow(row({ name: "Bedtime", is_active: true, capture_mode: "automatic", automatic_metric_id: "bedtime" }));
    expect(bedtime.isActive).toBe(true);
    expect(bedtime.captureMode).toBe("automatic");
    expect(bedtime.automaticMetricId).toBe("bedtime");
  });

  it("defaults a running source to a weekly target when legacy data has no cadence", () => {
    const running = variableFromRow(row({ name: "Running", capture_mode: "automatic", automatic_metric_id: "run_day" }));
    expect(running.trackingCadence).toBe("weekly");
  });

  it("upgrades the legacy added sugar field to the meal-derived source", () => {
    const sugar = variableFromRow(row({ name: "Added sugar", variable_type: "number", unit: "g", default_value: 0, is_active: true }));
    expect(sugar).toMatchObject({ captureMode: "automatic", automaticMetricId: "meal_added_sugar", defaultValue: null, unit: "g" });
  });
});

describe("journal read path", () => {
  it("does not provision or rewrite variables when the read path opts out", async () => {
    const journal = await loadJournalData("user-1", { includeAutomaticEntries: false, ensureDefaults: false });

    expect(journal).toEqual({ variables: [], entries: [], days: [] });
    expect(state.from).toHaveBeenCalledTimes(3);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe("ensureJournalVariables invariant", () => {
  it("never overwrites, inserts or modifies variables for an existing user who already has variables", async () => {
    const existingUserVariables = [
      { id: "1", name: "WHM", is_active: true, variable_type: "count", unit: "rounds", default_value: 0, day_period: "morning", capture_mode: "manual", automatic_metric_id: null, tracking_cadence: "daily" },
      { id: "2", name: "Masturbation", is_active: true, variable_type: "boolean", unit: null, default_value: false, day_period: "day", capture_mode: "manual", automatic_metric_id: null, tracking_cadence: "daily" },
      { id: "3", name: "Caffeine", is_active: true, variable_type: "number", unit: "mg", default_value: 0, day_period: "day", capture_mode: "manual", automatic_metric_id: null, tracking_cadence: "daily" },
    ];
    state.from.mockImplementation(() => query(existingUserVariables));

    await ensureJournalVariables("test-user-id");

    expect(state.insert).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("provisions starter variables for a new user with no existing variables", async () => {
    state.from.mockImplementation(() => query([]));

    await ensureJournalVariables("new-user-id", {
      selectedHabitNames: ["Bedtime before 11 PM", "Added sugar"],
      customHabits: [{ name: "Meditation 10 min", category: "sleep", emoji: "🧘" }],
    });

    expect(state.insert).toHaveBeenCalledTimes(1);
    const inserted = state.insert.mock.calls[0][0];
    // Must include context variables (Vacation, Illness)
    expect(inserted.some((v: { name: string }) => v.name === "Vacation")).toBe(true);
    expect(inserted.some((v: { name: string }) => v.name === "Illness")).toBe(true);
    // Must include selected habits
    expect(inserted.some((v: { name: string }) => v.name === "Bedtime before 11 PM")).toBe(true);
    expect(inserted.some((v: { name: string }) => v.name === "Added sugar")).toBe(true);
    // Must include custom habit
    expect(inserted.some((v: { name: string }) => v.name === "Meditation 10 min")).toBe(true);
    // Must NOT include WHM or Masturbation
    expect(inserted.some((v: { name: string }) => v.name === "WHM")).toBe(false);
    expect(inserted.some((v: { name: string }) => v.name === "Masturbation")).toBe(false);
  });
});
