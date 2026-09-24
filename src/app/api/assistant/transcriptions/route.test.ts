import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));

import { POST } from "./route";

function request(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("https://soma.example/api/assistant/transcriptions", { method: "POST", body: form });
}

describe("assistant dictation transcription", () => {
  beforeEach(() => {
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    vi.stubEnv("OPENAI_TRANSCRIPTION_API_KEY", "test-transcription-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("requires an authenticated user before reading audio", async () => {
    state.getCurrentUser.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(new File(["audio"], "note.webm", { type: "audio/webm" })));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a bounded French recording to GPT-Transcribe and returns editable text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "  Ma séance de course demain.  " }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request(new File(["recording"], "note.webm", { type: "audio/webm" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ text: "Ma séance de course demain." });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const body = options.body as FormData;
    expect(body.get("model")).toBe("gpt-transcribe");
    expect(body.get("languages[]")).toBe("fr");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(options.cache).toBe("no-store");
    expect(options.headers).toEqual({ Authorization: "Bearer test-transcription-key" });
  });

  it("rejects unsupported, missing and oversized audio before the provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request())).status).toBe(400);
    expect((await POST(request(new File(["x"], "note.txt", { type: "text/plain" })))).status).toBe(415);
    expect((await POST(request(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "note.webm", { type: "audio/webm" })))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps provider failures private and never treats silence as a message", async () => {
    const file = new File(["recording"], "note.webm", { type: "audio/webm" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("private provider error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: " " }), { status: 200 })));
    const failed = await POST(request(file));
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain("private provider error");
    expect((await POST(request(file))).status).toBe(422);
  });
});
