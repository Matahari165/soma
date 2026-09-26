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
  assistantDatabaseRequest.mockResolvedValue({ claimed: false, text: "v2\nUne observation déjà préparée.", generatedAt: "2026-09-25T08:00:00Z" });
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).text).toBe("Une observation déjà préparée.");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(provider).not.toHaveBeenCalled();
});

it("generates a bounded Luna preview once, then stores it for the same user", async () => {
  assistantDatabaseRequest.mockResolvedValueOnce({ claimed: true }).mockResolvedValueOnce(undefined);
  const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["La nuit enregistrée comprend 7 h 40 de sommeil."] }) }) });
  vi.stubGlobal("fetch", provider);
  const response = await POST(request());
  expect((await response.json()).text).toBe("La nuit enregistrée comprend 7 h 40 de sommeil.");
  const body = JSON.parse(provider.mock.calls[0][1].body);
  expect(body).toMatchObject({ model: "gpt-6-luna", store: false, reasoning: { effort: "low" }, max_output_tokens: 280 });
  expect(assistantDatabaseRequest.mock.calls[1][0]).toContain("user_id=eq.test-user");
  expect(assistantDatabaseRequest.mock.calls[1][1].body.status).toBe("ready");
});


it("replaces the old cache format with current facts without extra generation", async () => {
  assistantDatabaseRequest.mockResolvedValue({ claimed: false, text: "Une observation déjà préparée." });
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("7 h 40 de sommeil");
  expect(payload.text).toContain("65/100");
  expect(payload.text).not.toContain("déjà préparée");
  expect(provider).not.toHaveBeenCalled();
});

it("uses prior observations only and names their sample count in the fallback", async () => {
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
  getPersonalLabActivitySummaries.mockResolvedValue([{ count: 2, activity: { type: "RUN", durationMinutes: 44, distanceKm: 7.2 } }]);
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("Course à pied aujourd’hui : 44 min · 7,2 km. 2 activités enregistrées au total.");
  expect(payload.text).toContain("7 h 20 sur 3 nuits précédentes");
  expect(payload.text).toContain("60/100 en moyenne sur 3 jours précédents");
  expect(payload.text.split("\n")).toHaveLength(3);
  expect(payload.text.length).toBeLessThanOrEqual(350);
  expect(assistantDatabaseRequest).not.toHaveBeenCalled();
});

it("does not manufacture a baseline with too few observations and preserves explicit zero", async () => {
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: {
    sleepMinutes: null, recoveryScore: null, effortScore: 0, effortCoverage: 0.5,
    history: [{ date: "2026-09-24", sleepMinutes: 450, recoveryScore: 50 }],
  } }) });
  const payload = await (await POST(request())).json();
  expect(payload.text).toContain("0/100");
  expect(payload.text).toContain("Données d’activité partielles");
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
  assistantDatabaseRequest.mockResolvedValueOnce({ claimed: true }).mockResolvedValueOnce(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ lines: ["x".repeat(180), "y".repeat(180)] }) }) }));
  const payload = await (await POST(request())).json();
  expect(payload.text.length).toBeLessThanOrEqual(350);
  expect(payload.text).toContain("65/100");
  const stored = assistantDatabaseRequest.mock.calls[1][1].body;
  expect(stored.status).toBe("failed");
  expect(stored.insight_text.startsWith("v2\n")).toBe(true);
  expect(stored.insight_text.length).toBeLessThanOrEqual(360);
});


it("switches to the evening recap even when an activity took place earlier", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T19:00:00Z"));
  isLocalPreviewMode.mockReturnValue(true);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: { sleepMinutes: 460, effortScore: 12 } }) });
  getPersonalLabActivitySummaries.mockResolvedValue([{ count: 1, activity: { type: "RUN", durationMinutes: 44, distanceKm: 7.2 } }]);
  const payload = await (await POST(request())).json();
  expect(payload.moment).toBe("evening");
  expect(payload.text).toContain("Effort Soma accumulé aujourd’hui : 12/100");
  expect(payload.text).toContain("44 min");
});


it("does not describe failed activity loading as missing measurements", async () => {
  getPersonalLabActivitySummaries.mockRejectedValueOnce(new Error("Activity unavailable"));
  const payload = await (await POST(request())).json();
  expect(payload.unavailable).toBe(true);
  expect(payload.text).not.toContain("Aucune mesure");
});
