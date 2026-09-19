import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  loadJournalData: vi.fn(),
  listMeals: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({ from: state.from, rpc: state.rpc }),
}));
vi.mock("@/services/journal", () => ({ loadJournalData: state.loadJournalData }));
vi.mock("@/services/meal-api", () => ({ mealToApi: (meal: unknown) => meal }));
vi.mock("@/services/meals", () => ({ listMeals: state.listMeals }));

import { saveNativeJournalEntries } from "./native-lab";

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.from.mockImplementation((table: string) => table === "profiles"
    ? query({ data: { timezone: "Europe/Zurich" }, error: null })
    : query({ data: null, error: null }));
  state.loadJournalData.mockResolvedValue({
    variables: [{ id: "00000000-0000-4000-8000-000000000001", name: "Energy", variableType: "scale", unit: null, options: [], position: 10, isActive: true, emoji: "⚡", defaultValue: 0, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily" }],
    entries: [],
    days: [],
  });
  state.listMeals.mockResolvedValue([]);
  state.rpc.mockResolvedValue({ error: null });
});

describe("native journal persistence", () => {
  it("calls the four argument migration signature without an omission flag", async () => {
    await saveNativeJournalEntries("user-native", {
      entryDate: "2026-09-19",
      mode: "draft",
      entries: [{ variableId: "00000000-0000-4000-8000-000000000001", value: 3 }],
    });

    expect(state.rpc).toHaveBeenCalledWith("save_personal_lab_journal_day", {
      p_user_id: "user-native",
      p_entry_date: "2026-09-19",
      p_entries: [{ variable_id: "00000000-0000-4000-8000-000000000001", value: 3 }],
      p_validate: false,
    });
    expect(state.rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_replace_omissions");
  });

  it("never accepts an automatic value as a native user observation", async () => {
    state.loadJournalData.mockResolvedValueOnce({
      variables: [{ id: "00000000-0000-4000-8000-000000000002", name: "Detected", variableType: "boolean", unit: null, options: [], position: 10, isActive: true, emoji: "⚙️", defaultValue: null, dayPeriod: "day", captureMode: "automatic", automaticMetricId: "run_day", trackingCadence: "daily" }],
      entries: [],
      days: [],
    });

    await expect(saveNativeJournalEntries("user-native", {
      entryDate: "2026-09-19",
      mode: "draft",
      entries: [{ variableId: "00000000-0000-4000-8000-000000000002", value: true }],
    })).rejects.toThrow("Automatic journal variables cannot be written through this route.");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
