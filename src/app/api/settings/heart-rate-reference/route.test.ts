import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { id: "synthetic-user" } as { id: string } | null, load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/services/heart-rate-reference", () => ({ loadHeartRateReferenceForUser: state.load, saveHeartRateReferenceForUser: state.save }));
import { GET, PUT } from "./route";
const request = (body: unknown) => new Request("https://soma.example/api/settings/heart-rate-reference", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("heart-rate reference settings access", () => {
  beforeEach(() => {
    state.user = { id: "synthetic-user" };
    state.load.mockReset(); state.save.mockReset();
    state.load.mockResolvedValue({ personalBpm: 200, maximumHeartRate: { bpm: 200, source: "personal" } });
    state.save.mockResolvedValue({ personalBpm: null, maximumHeartRate: { bpm: 180, source: "age_estimate" } });
  });
  it("requires authentication for both reading and saving", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
    expect((await PUT(request({ personalBpm: 200 }))).status).toBe(401);
    expect(state.load).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
  });
  it("uses only the authenticated owner and prevents response caching", async () => {
    const response = await GET();
    expect(state.load).toHaveBeenCalledWith("synthetic-user");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it.each([79, 251, 150.5, "200", 0])("rejects invalid references: %s", async (personalBpm) => {
    expect((await PUT(request({ personalBpm }))).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("rejects owner injection instead of accepting a client user ID", async () => {
    expect((await PUT(request({ personalBpm: 200, userId: "another-user" }))).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("saves a personal reference for the authenticated owner", async () => {
    expect((await PUT(request({ personalBpm: 200 }))).status).toBe(200);
    expect(state.save).toHaveBeenCalledWith("synthetic-user", 200);
  });
  it("clears the personal override explicitly without turning missing data into zero", async () => {
    const response = await PUT(request({ personalBpm: null }));
    expect(state.save).toHaveBeenCalledWith("synthetic-user", null);
    expect(await response.json()).toMatchObject({ personalBpm: null, maximumHeartRate: { source: "age_estimate" } });
  });
  it("returns a stable error if storage is unavailable", async () => {
    state.save.mockRejectedValue(new Error("synthetic storage error"));
    expect((await PUT(request({ personalBpm: 200 }))).status).toBe(500);
  });
});
