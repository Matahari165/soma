import { beforeEach, afterEach, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const isLocalPreviewMode = vi.hoisted(() => vi.fn());
const assistantDatabaseRequest = vi.hoisted(() => vi.fn());
const getPersonalLabActivitySummaries = vi.hoisted(() => vi.fn());
const createPersonalLabStream = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode }));
vi.mock("@/modules/assistant/repository/database", () => ({ assistantDatabaseRequest, assistantFilter: encodeURIComponent }));
vi.mock("@/services/health-analytics", () => ({ getPersonalLabActivitySummaries }));
vi.mock("@/services/personal-lab", () => ({ createPersonalLabStream }));

import { POST } from "./route";

const request = () => new Request("https://soma.example/api/lab/home-insight", { method: "POST", headers: { origin: "https://soma.example", host: "soma.example" } });

function mockGenerationFlow() {
  const rows = new Map<string, { source_hash: string; status: string; insight_text: string | null; generated_at: string | null; generation_count: number }>();
  let claims = 0;
  const rowKey = (date: string, slot: string) => `${date}:${slot}`;
  const pathValue = (path: string, key: string) => decodeURIComponent(path.match(new RegExp(`${key}=eq.([^&]+)`))?.[1] ?? "");
  assistantDatabaseRequest.mockImplementation((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
    if (path.startsWith("home_soma_insights?select=")) {
      const row = rows.get(rowKey(pathValue(path, "local_date"), pathValue(path, "slot")));
      return Promise.resolve(row ? [row] : []);
    }
    if (path === "rpc/claim_home_soma_insight") {
      claims += 1;
      const body = options?.body ?? {};
      const key = rowKey(String(body.p_local_date), String(body.p_slot));
      rows.set(key, { source_hash: String(body.p_source_hash), status: "pending", insight_text: null, generated_at: null, generation_count: 1 });
      return Promise.resolve({ claimed: true });
    }
    if (path.startsWith("home_soma_insights?") && options?.method === "PATCH") {
      const key = rowKey(pathValue(path, "local_date"), pathValue(path, "slot"));
      const current = rows.get(key);
      if (current) rows.set(key, {
        ...current,
        status: String(options.body?.status),
        insight_text: String(options.body?.insight_text),
        generated_at: String(options.body?.generated_at),
      });
      return Promise.resolve(undefined);
    }
    return Promise.resolve(undefined);
  });
  return { rows, get claims() { return claims; } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-25T08:00:00Z"));
  getCurrentUser.mockResolvedValue({ id: "test-user" });
  isLocalPreviewMode.mockReturnValue(false);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: { sleepMinutes: 460, recoveryScore: 65, effortScore: null, energy: null, activity: null } }) });
  getPersonalLabActivitySummaries.mockResolvedValue([]);
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => { delete process.env.OPENAI_API_KEY; vi.unstubAllGlobals(); vi.useRealTimers(); });

it("requires authentication before loading personal data", async () => {
  getCurrentUser.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(createPersonalLabStream).not.toHaveBeenCalled();
});

it("reuses a cached insight without a model call", async () => {
  const database = mockGenerationFlow();
  const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["Cette nuit : 7 h 40 de sommeil."] }) }) });
  vi.stubGlobal("fetch", provider);
  await POST(request());
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ text: "Cette nuit : 7 h 40 de sommeil.", stale: false, generatedAt: "2026-09-25T08:00:00.000Z" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(provider).toHaveBeenCalledTimes(1);
  expect(database.claims).toBe(1);
});

it("generates a bounded Luna preview once, then stores it for the same user", async () => {
  mockGenerationFlow();
  const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["La nuit enregistrée comprend 7 h 40 de sommeil."] }) }) });
  vi.stubGlobal("fetch", provider);
  const response = await POST(request());
  expect(await response.json()).toMatchObject({ text: "La nuit enregistrée comprend 7 h 40 de sommeil.", stale: false, pending: false });
  const body = JSON.parse(provider.mock.calls[0][1].body);
  expect(body).toMatchObject({ model: "gpt-6-luna", store: false, reasoning: { effort: "low" }, max_output_tokens: 280 });
  expect(JSON.parse(body.input).activity).toBeNull();
  expect(body.instructions).toContain("ne les répète pas");
  expect(body.instructions).toContain("220 caractères");
  expect(body.text.format.schema.properties.lines.maxItems).toBe(2);
  const patch = assistantDatabaseRequest.mock.calls.find(([path, options]) => String(path).startsWith("home_soma_insights?") && options?.method === "PATCH");
  expect(patch?.[0]).toContain("user_id=eq.test-user");
  expect(patch?.[1].body.status).toBe("ready");
});


it("uses current facts after a source change without another generation, even after 45 minutes", async () => {
  const database = mockGenerationFlow();
  const provider = vi.fn();
  provider.mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["Une observation déjà préparée."] }) }) });
  vi.stubGlobal("fetch", provider);
  await POST(request());
  vi.advanceTimersByTime(46 * 60 * 1000);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: { sleepMinutes: 485, recoveryScore: 65 } }) });
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("8 h 05");
  expect(payload.text).toContain("65/100");
  expect(payload.text).not.toContain("déjà préparée");
  expect(payload.stale).toBe(true);
  expect(payload.generatedAt).toBe("2026-09-25T08:46:00.000Z");
  expect(provider).toHaveBeenCalledTimes(1);
  expect(database.claims).toBe(1);
});

it("uses prior observations only and names their sample count in the fallback", async () => {
  vi.setSystemTime(new Date("2026-09-25T10:00:00Z"));
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: {
    sleepMinutes: 460, recoveryScore: 65, effortScore: 12, effortCoverage: 0.5,
    history: [
      { date: "2026-09-21", sleepMinutes: 420, recoveryScore: 50 },
      { date: "2026-09-22", sleepMinutes: 450, recoveryScore: 60 },
      { date: "2026-09-23", sleepMinutes: 450, recoveryScore: 70 },
      { date: "2026-09-24", sleepMinutes: null, recoveryScore: null },
      { date: "2026-09-25", sleepMinutes: 900, recoveryScore: 100 },
      { date: "2026-09-26", sleepMinutes: 900, recoveryScore: 100 },
    ],
  } }) });
  const payload = await (await POST(request())).json();
  expect(payload.moment).toBe("day");
  expect(payload.text).toContain("20 min de plus que votre moyenne récente (3 nuits)");
  expect(payload.text).toContain("5 points au-dessus de votre moyenne récente (3 jours)");
  expect(payload.text.split("\n")).toHaveLength(2);
  expect(payload.text.length).toBeLessThanOrEqual(220);
  expect(assistantDatabaseRequest).not.toHaveBeenCalled();
});

it("compares only current and prior same-type activity pace without repeating adjacent duration or distance", async () => {
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: {} }) });
  getPersonalLabActivitySummaries.mockResolvedValue([
    { date: "2026-09-18", count: 2, activity: { type: "RUNNING", durationMinutes: 44, distanceKm: 7.2, averagePaceSecondsPerKm: 360 } },
    { date: "2026-09-20", count: 1, activity: { type: "RUNNING", durationMinutes: 40, distanceKm: 6.7, averagePaceSecondsPerKm: 350 } },
    { date: "2026-09-22", count: 1, activity: { type: "RUNNING", durationMinutes: 46, distanceKm: 7.4, averagePaceSecondsPerKm: 370 } },
    { date: "2026-09-23", count: 1, activity: { type: "CYCLING", durationMinutes: 60, distanceKm: 25, averagePaceSecondsPerKm: 120 } },
    { date: "2026-09-25", count: 3, activity: { type: "RUNNING", durationMinutes: 44, distanceKm: 7.2, averagePaceSecondsPerKm: 340 } },
  ]);
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("20 s/km plus rapide que la moyenne de 3 sorties comparables");
  expect(payload.text).toContain("3 activités enregistrées aujourd’hui ;");
  expect(payload.text).not.toContain("44 min");
  expect(payload.text).not.toContain("7,2 km");
  expect(getPersonalLabActivitySummaries).toHaveBeenCalledWith("test-user", "2026-09-18", "2026-09-25");
});

it("does not manufacture a baseline with too few observations and preserves explicit zero", async () => {
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: {
    sleepMinutes: null, recoveryScore: null, effortScore: 0, effortCoverage: 0.5,
    history: [{ date: "2026-09-24", sleepMinutes: 450, recoveryScore: 50 }],
  } }) });
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("0/100");
  expect(payload.text).toContain("données partielles");
  expect(payload.text).not.toContain("moyenne");
  expect(payload.text).not.toContain("sommeil");
});

it("reports missing data honestly and a loading failure as unavailable", async () => {
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: {} }) });
  expect((await (await POST(request())).json()).text).toContain("Aucune mesure");
  createPersonalLabStream.mockReturnValue({ overview: Promise.reject(new Error("Unavailable")) });
  const payload = await (await POST(request())).json();
  expect(payload.unavailable).toBe(true);
  expect(payload.text).toContain("indisponible");
});

it("rejects an oversized generation and stores a bounded factual fallback", async () => {
  mockGenerationFlow();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["x".repeat(180), "y".repeat(180)] }) }) }));
  const payload = await (await POST(request())).json();
  expect(payload.text.length).toBeLessThanOrEqual(220);
  expect(payload.text).toContain("65/100");
  const patch = assistantDatabaseRequest.mock.calls.find(([path, options]) => String(path).startsWith("home_soma_insights?") && options?.method === "PATCH");
  const stored = patch?.[1].body;
  expect(stored.status).toBe("failed");
  expect(stored.insight_text.startsWith("v3\n")).toBe(true);
  expect(stored.insight_text.length).toBeLessThanOrEqual(223);
});


it("switches to the evening recap even when an activity took place earlier", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T19:00:00Z"));
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: { sleepMinutes: 460, effortScore: 12 } }) });
  getPersonalLabActivitySummaries.mockResolvedValue([{ date: "2026-09-25", count: 1, activity: { type: "RUN", durationMinutes: 44, distanceKm: 7.2, averagePaceSecondsPerKm: null } }]);
  const payload = await (await POST(request())).json();
  expect(payload.moment).toBe("evening");
  expect(payload.text).toContain("Effort Soma : 12/100");
  expect(payload.text).not.toContain("44 min");
});


it("does not describe failed activity loading as missing measurements", async () => {
  getPersonalLabActivitySummaries.mockRejectedValueOnce(new Error("Activity unavailable"));
  const payload = await (await POST(request())).json();
  expect(payload.unavailable).toBe(true);
  expect(payload.text).not.toContain("Aucune mesure");
});

it.each(["pending", "failed"] as const)("does not retry a %s slot after source data changes", async (status) => {
  assistantDatabaseRequest.mockImplementation((path: string) => path.startsWith("home_soma_insights?select=")
    ? Promise.resolve([{ source_hash: "older-source", status, insight_text: null, generated_at: "2026-09-25T07:00:00Z", generation_count: 1 }])
    : Promise.resolve(undefined));
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("Cette nuit : 7 h 40");
  expect(payload.stale).toBe(true);
  expect(provider).not.toHaveBeenCalled();
  expect(assistantDatabaseRequest).not.toHaveBeenCalledWith("rpc/claim_home_soma_insight", expect.anything());
});

it("allows at most one generation in each of the three daily slots", async () => {
  const database = mockGenerationFlow();
  getPersonalLabActivitySummaries.mockResolvedValue([{ date: "2026-09-25", count: 1, activity: { type: "RUN", durationMinutes: 44, distanceKm: 7.2, averagePaceSecondsPerKm: null } }]);
  const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["Cette nuit : 7 h 40 de sommeil."] }) }) });
  vi.stubGlobal("fetch", provider);
  const requestAtLocalHour = async (hour: number) => {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 25, hour - 2, 0, 0)));
    return POST(request());
  };

  getPersonalLabActivitySummaries.mockResolvedValue([]);
  await requestAtLocalHour(8);
  await requestAtLocalHour(11);
  getPersonalLabActivitySummaries.mockResolvedValue([{ date: "2026-09-25", count: 1, activity: { type: "RUN", durationMinutes: 44, distanceKm: 7.2, averagePaceSecondsPerKm: null } }]);
  await requestAtLocalHour(15);
  await requestAtLocalHour(17);
  await requestAtLocalHour(19);
  await requestAtLocalHour(23);

  expect(provider).toHaveBeenCalledTimes(3);
  expect(database.claims).toBe(3);
  expect(assistantDatabaseRequest.mock.calls.filter(([path]) => path === "rpc/claim_home_soma_insight").map(([, options]) => options?.body?.p_slot)).toEqual(["morning", "activity", "evening"]);
});

it.each([4, 14])("does not call the model during local hour %i without an activity", async (hour) => {
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 25, hour - 2, 0, 0)));
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const payload = await (await POST(request())).json();
  expect(payload.moment).toBe("day");
  expect(provider).not.toHaveBeenCalled();
  expect(assistantDatabaseRequest).not.toHaveBeenCalled();
});

it("rejects raw sleep minutes from model text and formats the fallback as hours and minutes", async () => {
  mockGenerationFlow();
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: { sleepMinutes: 485 } }) });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["Cette nuit : 485 minutes de sommeil."] }) }) }));
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("Cette nuit : 8 h 05");
  expect(payload.text).not.toContain("485 minutes");
  expect(payload.text.length).toBeLessThanOrEqual(220);
  const patch = assistantDatabaseRequest.mock.calls.find(([path, options]) => String(path).startsWith("home_soma_insights?") && options?.method === "PATCH");
  expect(patch?.[1].body.status).toBe("failed");
});

it("does not spend a morning attempt when there are no facts to summarize", async () => {
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: {} }) });
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("Aucune mesure");
  expect(provider).not.toHaveBeenCalled();
  expect(assistantDatabaseRequest).not.toHaveBeenCalled();
});
