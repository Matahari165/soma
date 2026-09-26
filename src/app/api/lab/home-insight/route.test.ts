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
  getCurrentUser.mockResolvedValue({ id: "test-user" });
  isLocalPreviewMode.mockReturnValue(false);
  createPersonalLabStream.mockReturnValue({ overview: Promise.resolve({ todayDate: "2026-09-25", timeZone: "Europe/Paris", today: { sleepMinutes: 460, recoveryScore: 65, effortScore: null, energy: null, activity: null } }) });
  getPersonalLabActivitySummaries.mockResolvedValue([]);
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => { delete process.env.OPENAI_API_KEY; vi.unstubAllGlobals(); });

it("requires authentication before loading personal data", async () => {
  getCurrentUser.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(createPersonalLabStream).not.toHaveBeenCalled();
});

it("reuses a cached insight without a model call", async () => {
  assistantDatabaseRequest.mockResolvedValue({ claimed: false, text: "Une observation déjà préparée.", generatedAt: "2026-09-25T08:00:00Z" });
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
  expect(body).toMatchObject({ model: "gpt-6-luna", store: false, reasoning: { effort: "low" }, max_output_tokens: 190 });
  expect(assistantDatabaseRequest.mock.calls[1][0]).toContain("user_id=eq.test-user");
  expect(assistantDatabaseRequest.mock.calls[1][1].body.status).toBe("ready");
});
