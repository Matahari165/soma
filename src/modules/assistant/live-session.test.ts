import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isLocalPreviewMode: vi.fn(),
  createAssistantConversation: vi.fn(),
  findAssistantConversation: vi.fn(),
  respondToAssistant: vi.fn(),
  createPreviewConversation: vi.fn(),
  getPreviewConversation: vi.fn(),
  respondToPreviewChat: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isLocalPreviewMode: state.isLocalPreviewMode }));
vi.mock("@/modules/assistant/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/assistant/repository")>()),
  createAssistantConversation: state.createAssistantConversation,
  findAssistantConversation: state.findAssistantConversation,
}));
vi.mock("./respond", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./respond")>()),
  respondToAssistant: state.respondToAssistant,
}));
vi.mock("./local-preview-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./local-preview-chat")>()),
  createPreviewConversation: state.createPreviewConversation,
  getPreviewConversation: state.getPreviewConversation,
  respondToPreviewChat: state.respondToPreviewChat,
}));

import { AssistantLiveError, createAssistantLiveSession, respondToAssistantLiveDelegation } from "./live-session";

const userId = "user-live-1";
const otherUserId = "user-live-2";
const conversationId = "11111111-1111-4111-8111-111111111111";
const sdpOffer = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const sdpAnswer = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const apiKey = "test-live-key-not-a-real-secret";

function providerResponse(sessionId = "live_session_123") {
  return new Response(JSON.stringify({
    session: { id: sessionId },
    transport: { type: "webrtc", sdp: sdpAnswer },
  }), { status: 201, headers: { "Content-Type": "application/json" } });
}

describe("assistant Live voice session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_LIVE_API_KEY", apiKey);
    vi.stubEnv("OPENAI_API_KEY", "test-chat-key-not-a-real-secret");
    state.isLocalPreviewMode.mockReturnValue(false);
    state.createAssistantConversation.mockResolvedValue({ id: conversationId });
    state.findAssistantConversation.mockResolvedValue({ id: conversationId });
    state.createPreviewConversation.mockReturnValue({ id: conversationId });
    state.getPreviewConversation.mockReturnValue({ id: conversationId });
    state.respondToAssistant.mockResolvedValue({
      conversationId,
      assistantMessage: { parts: [{ type: "text", text: "Voici une réponse avec les faits vérifiés." }] },
    });
    state.respondToPreviewChat.mockResolvedValue({
      conversationId,
      assistantMessage: { parts: [{ type: "text", text: "Réponse de démonstration." }] },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exchanges the browser SDP with GPT-Live and returns only the bounded session handshake", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(providerResponse());
    const result = await createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, { fetchImpl });

    expect(result).toMatchObject({ sessionId: "live_session_123", conversationId, sdp: sdpAnswer });
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(state.createAssistantConversation).toHaveBeenCalledWith(userId);

    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/live/sessions");
    expect(new Headers(request.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
    expect(new Headers(request.headers).get("openai-safety-identifier")).toMatch(/^[0-9a-f]{64}$/);
    const body = JSON.parse(String(request.body));
    expect(body.transport).toEqual({ type: "webrtc", sdp: sdpOffer });
    expect(body.session).toMatchObject({
      model: "gpt-live-1",
      store: false,
      delegation: { type: "client" },
      client: { data_channel: { allowed_client_events: ["session.commentary.append", "session.close"] } },
    });
    expect(body.session.instructions).toContain("Delegate to the backend when:");
    expect(body.session.instructions).toContain("Ne prétends jamais avoir consulté les données");
  });

  it("fails closed when the Live key is absent or the SDP offer is invalid", async () => {
    vi.stubEnv("OPENAI_LIVE_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, { fetchImpl }))
      .rejects.toMatchObject({ code: "assistant_live_not_configured", status: 503 });

    vi.stubEnv("OPENAI_LIVE_API_KEY", apiKey);
    await expect(createAssistantLiveSession(userId, { conversationId: null, sdp: "not-an-offer" }, { fetchImpl }))
      .rejects.toMatchObject({ code: "assistant_live_invalid_request", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.createAssistantConversation).not.toHaveBeenCalled();
  });

  it("rejects voice startup before a paid Live session when the backend chat key is absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, { fetchImpl }))
      .rejects.toMatchObject({ code: "assistant_live_not_configured", status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.createAssistantConversation).not.toHaveBeenCalled();
  });

  it("checks that an existing conversation belongs to the authenticated user", async () => {
    state.findAssistantConversation.mockResolvedValue(null);
    const fetchImpl = vi.fn();
    await expect(createAssistantLiveSession(userId, { conversationId, sdp: sdpOffer }, { fetchImpl }))
      .rejects.toMatchObject({ code: "assistant_live_conversation_not_found", status: 404 });
    expect(state.findAssistantConversation).toHaveBeenCalledWith(userId, conversationId);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not return provider details or credentials on an OpenAI session failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("private provider response", { status: 401 }));
    const attempt = createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, { fetchImpl });
    await expect(attempt).rejects.toMatchObject({ code: "assistant_live_session_failed", status: 502 });
    await expect(attempt).rejects.not.toThrow(/private provider response|test-live-key-not-a-real-secret/);
    expect(state.createAssistantConversation).not.toHaveBeenCalled();
  });

  it("rejects a successful but malformed Live response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session: { id: "live_session_123" } }), { status: 201 }));
    await expect(createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, { fetchImpl }))
      .rejects.toMatchObject({ code: "assistant_live_session_failed", status: 502 });
    expect(state.createAssistantConversation).not.toHaveBeenCalled();
  });

  it("binds a delegation ticket to its user and persists a normal Luna conversation turn idempotently", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(providerResponse());
    const session = await createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, { fetchImpl });
    const request = { sessionToken: session.sessionToken, delegationId: "item_abc123", transcript: "Analyse mon sommeil cette semaine." };

    const result = await respondToAssistantLiveDelegation(userId, request);
    expect(result).toEqual({ delegationId: "item_abc123", responseText: "Voici une réponse avec les faits vérifiés." });
    expect(state.respondToAssistant).toHaveBeenCalledWith(userId, expect.objectContaining({
      conversationId,
      text: request.transcript,
      attachmentIds: [],
      requestId: expect.stringMatching(/^live-[a-f0-9]{64}$/),
    }));
    expect(JSON.stringify(result)).not.toContain(apiKey);

    const firstRequestId = state.respondToAssistant.mock.calls[0][1].requestId;
    await respondToAssistantLiveDelegation(userId, request);
    expect(state.respondToAssistant.mock.calls[1][1].requestId).toBe(firstRequestId);

    await expect(respondToAssistantLiveDelegation(otherUserId, request))
      .rejects.toBeInstanceOf(AssistantLiveError);
    await expect(respondToAssistantLiveDelegation(otherUserId, request))
      .rejects.toMatchObject({ code: "assistant_live_session_invalid", status: 401 });
    expect(state.respondToAssistant).toHaveBeenCalledTimes(2);

    const damagedToken = `${session.sessionToken.slice(0, -1)}${session.sessionToken.endsWith("a") ? "b" : "a"}`;
    await expect(respondToAssistantLiveDelegation(userId, { ...request, sessionToken: damagedToken }))
      .rejects.toMatchObject({ code: "assistant_live_session_invalid", status: 401 });
    expect(state.respondToAssistant).toHaveBeenCalledTimes(2);
  });

  it("bounds spoken commentary to 1,600 bytes at a sentence boundary when possible", async () => {
    const fullAnswer = Array.from({ length: 300 }, () => "La tendance est stable.").join(" ");
    state.respondToAssistant.mockResolvedValueOnce({
      conversationId,
      assistantMessage: { parts: [{ type: "text", text: fullAnswer }] },
    });
    const session = await createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, {
      fetchImpl: vi.fn().mockResolvedValue(providerResponse()),
    });
    const result = await respondToAssistantLiveDelegation(userId, {
      sessionToken: session.sessionToken,
      delegationId: "item_large_result",
      transcript: "Analyse mon sommeil",
    });

    expect(Buffer.byteLength(result.responseText, "utf8")).toBeLessThanOrEqual(1_600);
    expect(result.responseText).toContain("Le reste est affiché dans la conversation.");
    expect(result.responseText).toMatch(/La tendance est stable\.… Le reste est affiché dans la conversation\.$/);
    expect(state.respondToAssistant.mock.calls[0][1].text).toBe("Analyse mon sommeil");
  });

  it("uses the preview conversation and preview assistant when running locally", async () => {
    state.isLocalPreviewMode.mockReturnValue(true);
    const session = await createAssistantLiveSession(userId, { conversationId: null, sdp: sdpOffer }, {
      fetchImpl: vi.fn().mockResolvedValue(providerResponse()),
    });

    expect(state.createPreviewConversation).toHaveBeenCalledOnce();
    expect(state.createAssistantConversation).not.toHaveBeenCalled();
    await expect(respondToAssistantLiveDelegation(userId, {
      sessionToken: session.sessionToken,
      delegationId: "item_preview",
      transcript: "Bonjour Soma",
    })).resolves.toEqual({ delegationId: "item_preview", responseText: "Réponse de démonstration." });
    expect(state.respondToPreviewChat).toHaveBeenCalledWith(expect.objectContaining({ conversationId, text: "Bonjour Soma" }));
    expect(state.respondToAssistant).not.toHaveBeenCalled();
  });
});
