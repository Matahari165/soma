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

import { variableFromRow, type JournalVariableRow } from "./journal";
import { loadJournalData } from "./journal";

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
  builder.insert = state.insert;
  builder.update = state.update;
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
