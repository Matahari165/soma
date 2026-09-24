import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));

import { POST } from "./route";

const validSdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const validBody = JSON.stringify({ conversationId: null, sdp: validSdp });

function request(body = validBody, headers: HeadersInit = { "Content-Type": "application/json", Origin: "https://soma.example" }) {
  return new Request("https://soma.example/api/assistant/live/sessions", { method: "POST", headers, body });
}

describe("assistant Live session route", () => {
  beforeEach(() => {
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://soma.example");
    vi.stubEnv("OPENAI_LIVE_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("requires authentication before parsing the request or calling OpenAI", async () => {
    state.getCurrentUser.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request("not json"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests and invalid SDP before provider access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const crossOrigin = await POST(request(validBody, { "Content-Type": "application/json", Origin: "https://attacker.example" }));
    const invalidSdp = await POST(request(JSON.stringify({ conversationId: null, sdp: "bad" })));

    expect(crossOrigin.status).toBe(403);
    expect(invalidSdp.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a sanitized configuration error when the dedicated key is absent", async () => {
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ code: "assistant_live_not_configured" });
  });
});
