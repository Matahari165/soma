import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getCurrentUser } from "@/lib/auth";
import { getNativeLabDay, saveNativeJournalEntries } from "@/services/native-lab";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

import { GET as getWebMatrix } from "@/app/api/lab/matrix/route";
import { GET as getDay } from "./day/route";
import { PUT as saveJournal } from "./journal/route";
import { GET as getMatrix } from "./matrix/route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/services/native-lab", () => ({ getNativeLabDay: vi.fn(), saveNativeJournalEntries: vi.fn() }));
vi.mock("@/services/personal-lab", () => ({ getPersonalLabSnapshot: vi.fn() }));

const user = { id: "user-native", email: "native@example.test", displayName: "Native User" };
const variableId = "5f3d636b-50f3-4cbd-a185-58a9aca74e18";
const day = {
  date: "2026-09-18",
  timezone: "Europe/Zurich",
  journal: {
    variables: [{ id: variableId, name: "Energy", variableType: "scale", unit: null, options: [], position: 10, isActive: true, emoji: "⚡", defaultValue: null, dayPeriod: "day" }],
    entries: [
      { variableId, entryDate: "2026-09-18", value: 0, source: "manual" as const },
      { variableId: "00000000-0000-4000-8000-000000000002", entryDate: "2026-09-18", value: false, source: "manual" as const },
    ],
    day: { entryDate: "2026-09-18", status: "validated" as const, validatedAt: "2026-09-18T20:00:00.000Z", omittedVariableIds: ["00000000-0000-4000-8000-000000000003"] },
  },
  meals: {
    breakfast: null,
    lunch: { id: "meal-skipped", mealDate: "2026-09-18", mealType: "lunch", entryState: "skipped" as const, status: "draft" as const },
    dinner: null,
    snack: null,
  },
};
const matrix = {
  rows: [{ id: "sleep_minutes", label: "Sleep", emoji: "🌙", grain: "day" as const, timeScale: "acute" as const, period: 30 as const, lagLabel: "same day", relations: [] }],
  outcomes: [{ id: "recovery", label: "Recovery", unit: "score", direction: "higher" as const }],
  periods: [30 as const],
  meaningfulRelations: [],
  topRelations: [],
  acuteHighlights: [],
  chronicHighlights: [],
  coverageByMetric: [],
  collectionProgress: [],
};

describe("native Personal Lab API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
  });

  it("requires the bearer session for every native lab route", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    expect((await getDay(new Request("https://soma.example/api/native/v1/lab/day?date=2026-09-18"))).status).toBe(401);
    expect((await saveJournal(new Request("https://soma.example/api/native/v1/lab/journal", { method: "PUT", body: "{}" }))).status).toBe(401);
    expect((await getMatrix(new NextRequest("https://soma.example/api/native/v1/lab/matrix?period=30"))).status).toBe(401);
  });

  it("returns one date with explicit zero, false, omitted and skipped states intact", async () => {
    vi.mocked(getNativeLabDay).mockResolvedValue(day as never);
    const response = await getDay(new Request("https://soma.example/api/native/v1/lab/day?date=2026-09-18"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(day);
    expect(getNativeLabDay).toHaveBeenCalledWith(user.id, "2026-09-18");
  });

  it("validates and saves the stable journal contract, then returns the canonical day", async () => {
    vi.mocked(saveNativeJournalEntries).mockResolvedValue({ status: "validated", saved: 2, omitted: 1 });
    vi.mocked(getNativeLabDay).mockResolvedValue(day as never);
    const response = await saveJournal(new Request("https://soma.example/api/native/v1/lab/journal", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryDate: "2026-09-18", mode: "validate", entries: [
        { variableId, value: 0 },
        { variableId: "00000000-0000-4000-8000-000000000002", value: false },
        { variableId: "00000000-0000-4000-8000-000000000003", value: null },
      ] }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "validated", saved: 2, omitted: 1, day });
    expect(saveNativeJournalEntries).toHaveBeenCalledWith(user.id, expect.objectContaining({ entryDate: "2026-09-18", mode: "validate" }));
  });

  it("uses the same matrix snapshot as the Web route and exposes the native statistical details", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue({ matrix } as never);
    const response = await getMatrix(new NextRequest("https://soma.example/api/native/v1/lab/matrix?period=30"));
    const webResponse = await getWebMatrix(new NextRequest("https://soma.example/api/lab/matrix?period=30"));
    expect(response.status).toBe(200);
    const nativePayload = await response.json();
    const webPayload = await webResponse.json();
    expect(nativePayload).toEqual({ period: 30, ...matrix });
    expect(webPayload).toEqual({ rows: matrix.rows, outcomes: matrix.outcomes, periods: matrix.periods });
    expect(nativePayload).toMatchObject(webPayload);
    expect(getPersonalLabSnapshot).toHaveBeenCalledWith(user, { periods: [30] });
  });

  it("rejects malformed dates, journal bodies and matrix periods", async () => {
    expect((await getDay(new Request("https://soma.example/api/native/v1/lab/day?date=18-09-2026"))).status).toBe(400);
    expect((await saveJournal(new Request("https://soma.example/api/native/v1/lab/journal", { method: "PUT", body: "{}" }))).status).toBe(400);
    expect((await getMatrix(new NextRequest("https://soma.example/api/native/v1/lab/matrix?period=7"))).status).toBe(400);
  });

  it("does not expose internal journal storage errors", async () => {
    vi.mocked(saveNativeJournalEntries).mockRejectedValue(new Error("private database detail"));
    const response = await saveJournal(new Request("https://soma.example/api/native/v1/lab/journal", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryDate: "2026-09-18", mode: "draft", entries: [{ variableId, value: 0 }] }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "The journal could not be saved." });
  });
});
