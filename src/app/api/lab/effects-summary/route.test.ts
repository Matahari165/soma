import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getPersonalLabSnapshot = vi.hoisted(() => vi.fn());
const selectSummaryRelations = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/services/personal-lab", () => ({ getPersonalLabSnapshot }));
vi.mock("@/domain/lab/matrix", () => ({ selectSummaryRelations }));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://soma.example/api/lab/effects-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("effects summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "test-user" });
    getPersonalLabSnapshot.mockResolvedValue({ matrix: { rows: [{ relations: [] }] } });
    selectSummaryRelations.mockReturnValue([{ predictorLabel: "Bedtime", comparisonLabel: "30 min later", outcomeLabel: "Recovery", effect: -3, outcomeUnit: "pts", lagDays: 1, sampleSize: 30, practicalRatio: 1.2, stable: true }]);
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => { delete process.env.OPENAI_API_KEY; vi.unstubAllGlobals(); });

  it("requires the current user before reading health data", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await POST(request({ period: 90, requireTemporalStability: true }));
    expect(response.status).toBe(401);
    expect(getPersonalLabSnapshot).not.toHaveBeenCalled();
  });

  it("rejects an invalid period before reading health data", async () => {
    const response = await POST(request({ period: 7, requireTemporalStability: true }));
    expect(response.status).toBe(400);
    expect(getPersonalLabSnapshot).not.toHaveBeenCalled();
  });

  it("does not call the provider without a configured key", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const response = await POST(request({ period: 90, requireTemporalStability: true }));
    expect(response.status).toBe(503);
    expect(getPersonalLabSnapshot).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns a bounded selection without exposing the key or raw provider response", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const provider = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ ranked: [{ index: 0, note: "Association observée sur cette période." }] }) }] }] }) });
    vi.stubGlobal("fetch", provider);
    const response = await POST(request({ period: 90, requireTemporalStability: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ranked: [{ index: 0, note: "Association observée sur cette période." }] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = JSON.parse(provider.mock.calls[0][1].body as string);
    expect(body.model).toBe("gpt-6-luna");
    expect(body.store).toBe(false);
    expect(provider.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
  });

  it("fails closed on malformed provider output", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: "not-json" }) }));
    const response = await POST(request({ period: 90, requireTemporalStability: false }));
    expect(response.status).toBe(502);
  });

  it.each(["Une relation mêlée 关联.", "Une phrase inachevée"])("does not publish an unreadable note: %s", async (note) => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ ranked: [{ index: 0, note }] }) }) }));
    const response = await POST(request({ period: 90, requireTemporalStability: false }));
    expect(response.status).toBe(502);
  });

  it("rejects a model selection outside the supplied evidence", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify({ ranked: [{ index: 2, note: "Unverified" }] }) }) }));
    const response = await POST(request({ period: 90, requireTemporalStability: false }));
    expect(response.status).toBe(502);
  });
});
