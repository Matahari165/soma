// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { AssistantLiveVoice } from "./assistant-live-voice";

let latestChannel: TestDataChannel | null = null;
let latestPeerClose: (() => void) | null = null;

class TestDataChannel {
  readyState: RTCDataChannelState = "connecting";
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Array<Record<string, unknown>> = [];

  send = vi.fn((value: string) => { this.sent.push(JSON.parse(value) as Record<string, unknown>); });
  close = vi.fn(() => { this.readyState = "closed"; });

  emit(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }
}

class TestPeerConnection {
  iceGatheringState: RTCIceGatheringState = "complete";
  connectionState: RTCPeerConnectionState = "connected";
  localDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new TestDataChannel();

  constructor() { latestChannel = this.channel; latestPeerClose = this.close; }
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.channel as unknown as RTCDataChannel);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "browser-offer" } as RTCSessionDescriptionInit));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => { this.localDescription = description; });
  setRemoteDescription = vi.fn(async () => {
    this.channel.readyState = "open";
    queueMicrotask(() => this.channel.emit({ type: "session.started", session: { id: "live-session" } }));
  });
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  latestChannel = null;
  latestPeerClose = null;
});

it("connects the microphone through Soma, returns Luna's result to the Live delegation, and closes cleanly", async () => {
  const stopTrack = vi.fn();
  const audioTrack = { enabled: true, readyState: "live" as MediaStreamTrackState, stop: stopTrack };
  stopTrack.mockImplementation(() => { audioTrack.readyState = "ended"; });
  const stream = { getAudioTracks: () => [audioTrack], getTracks: () => [audioTrack] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
  const voiceResponse = `Évaluation du sommeil : ${"ta récupération est favorable aujourd’hui. ".repeat(30)}`;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
    if (String(input).endsWith("/sessions")) {
      return Response.json({ sessionId: "live-session", conversationId: "conversation-1", sessionToken: "signed-session-token", sdp: "server-answer" });
    }
    return Response.json({ delegationId: "delegation-1", responseText: voiceResponse });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onBusyChange = vi.fn();
  const onConversationStarted = vi.fn();
  const onConversationUpdated = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(
    <AssistantLiveVoice
      conversationId={null}
      disabled={false}
      onBusyChange={onBusyChange}
      onConversationStarted={onConversationStarted}
      onConversationUpdated={onConversationUpdated}
    />,
  ));
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Démarrer le mode vocal"]')?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/assistant/live/sessions", expect.objectContaining({ method: "POST" }));
  expect(onConversationStarted).toHaveBeenCalledWith("conversation-1");
  await vi.waitFor(() => expect(container.querySelector('[data-live-phase="active"]')).not.toBeNull());
  expect(latestChannel).not.toBeNull();

  await act(async () => {
    latestChannel?.emit({ type: "session.input_transcript.delta", delta: "Analyse mon sommeil, ", start_ms: 0, end_ms: 1_200 });
    latestChannel?.emit({ type: "session.input_transcript.delta", delta: "s’il te plaît.", start_ms: 1_200, end_ms: 1_850 });
    latestChannel?.emit({ type: "session.delegation.created", offset_ms: 1_900, delegation: { id: "delegation-1", target: "client" } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  const delegationCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/delegations"));
  expect(delegationCall?.[0]).toBe("/api/assistant/live/delegations");
  expect(JSON.parse(String(delegationCall?.[1]?.body))).toEqual({
    sessionToken: "signed-session-token",
    delegationId: "delegation-1",
    transcript: "Analyse mon sommeil, s’il te plaît.",
  });
  const commentaryChunks = latestChannel?.sent
    .filter((event) => event.type === "session.commentary.append")
    .map((event) => String(event.content));
  expect(commentaryChunks?.length).toBeGreaterThan(1);
  expect(commentaryChunks?.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 350)).toBe(true);
  expect(commentaryChunks?.join(" ")).toBe(voiceResponse.trim());
  expect(onConversationUpdated).toHaveBeenCalledWith("conversation-1");

  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Terminer le mode vocal"]')?.click());
  expect(latestChannel?.sent).toContainEqual(expect.objectContaining({ type: "session.close" }));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(latestChannel?.close).not.toHaveBeenCalled();
  await act(async () => latestChannel?.emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 5 } }));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-live-phase="idle"]')).not.toBeNull();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  await act(async () => root.unmount());
});

it("serializes delegations and drops a result superseded by a newer request", async () => {
  const audioTrack = { enabled: true, readyState: "live" as MediaStreamTrackState, stop: vi.fn() };
  const stream = { getAudioTracks: () => [audioTrack], getTracks: () => [audioTrack] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
  let resolveFirstResponse: ((response: Response) => void) | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/sessions")) {
      return Response.json({ sessionId: "live-session", conversationId: "conversation-1", sessionToken: "signed-session-token", sdp: "server-answer" });
    }
    const body = JSON.parse(String(init?.body)) as { delegationId: string };
    if (body.delegationId === "delegation-1") {
      return new Promise<Response>((resolve) => { resolveFirstResponse = resolve; });
    }
    return Response.json({ delegationId: body.delegationId, responseText: "Résultat de la demande la plus récente." });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onBusyChange = vi.fn();
  const onConversationStarted = vi.fn();
  const onConversationUpdated = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(
    <AssistantLiveVoice
      conversationId={null}
      disabled={false}
      onBusyChange={onBusyChange}
      onConversationStarted={onConversationStarted}
      onConversationUpdated={onConversationUpdated}
    />,
  ));
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Démarrer le mode vocal"]')?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
  await vi.waitFor(() => expect(container.querySelector('[data-live-phase="active"]')).not.toBeNull());

  await act(async () => {
    latestChannel?.emit({ type: "session.input_transcript.delta", delta: "Analyse mon sommeil.", start_ms: 0, end_ms: 1_000 });
    latestChannel?.emit({ type: "session.delegation.created", offset_ms: 1_100, delegation: { id: "delegation-1", target: "client" } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
  expect(resolveFirstResponse).toBeDefined();

  await act(async () => {
    latestChannel?.emit({ type: "session.input_transcript.delta", delta: "Et corrige avec la dernière nuit.", start_ms: 1_300, end_ms: 1_900 });
    latestChannel?.emit({ type: "session.delegation.created", offset_ms: 2_000, delegation: { id: "delegation-2", target: "client" } });
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(latestChannel?.sent).toContainEqual(expect.objectContaining({
    type: "session.commentary.append",
    delegation_id: "delegation-1",
    content: "Je prends en compte ta dernière précision et je mets à jour la demande précédente.",
  }));
  expect(latestChannel?.sent).toContainEqual(expect.objectContaining({
    type: "session.commentary.append",
    delegation_id: "delegation-2",
    content: "Je vérifie la demande avec ta dernière précision.",
  }));

  await act(async () => {
    resolveFirstResponse?.(Response.json({ delegationId: "delegation-1", responseText: "Réponse devenue obsolète." }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(latestChannel?.sent.some((event) => event.delegation_id === "delegation-2")).toBe(true));
  });

  const oldTaskCommentary = latestChannel?.sent
    .filter((event) => event.type === "session.commentary.append" && event.delegation_id === "delegation-1")
    .map((event) => event.content);
  expect(oldTaskCommentary).toEqual(["Je prends en compte ta dernière précision et je mets à jour la demande précédente."]);
  const latestTaskCommentary = latestChannel?.sent
    .filter((event) => event.type === "session.commentary.append" && event.delegation_id === "delegation-2")
    .map((event) => event.content);
  expect(latestTaskCommentary).toEqual([
    "Je vérifie la demande avec ta dernière précision.",
    "Résultat de la demande la plus récente.",
  ]);
  expect(onConversationUpdated).toHaveBeenCalledTimes(1);
  expect(onConversationUpdated).toHaveBeenCalledWith("conversation-1");

  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Terminer le mode vocal"]')?.click());
  await act(async () => latestChannel?.emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 5 } }));
  await act(async () => root.unmount());
});

it("keeps the active transport open after unmount until the provider confirms closure", async () => {
  const stopTrack = vi.fn();
  const audioTrack = { enabled: true, readyState: "live" as MediaStreamTrackState, stop: stopTrack };
  stopTrack.mockImplementation(() => { audioTrack.readyState = "ended"; });
  const stream = { getAudioTracks: () => [audioTrack], getTracks: () => [audioTrack] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
  const fetchMock = vi.fn(async () => Response.json({ sessionId: "live-session", conversationId: "conversation-1", sessionToken: "signed-session-token", sdp: "server-answer" }));
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(<AssistantLiveVoice conversationId={null} disabled={false} onBusyChange={vi.fn()} onConversationStarted={vi.fn()} onConversationUpdated={vi.fn()} />));
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Démarrer le mode vocal"]')?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
  await vi.waitFor(() => expect(container.querySelector('[data-live-phase="active"]')).not.toBeNull());

  await act(async () => root.unmount());
  expect(latestChannel?.sent).toContainEqual(expect.objectContaining({ type: "session.close" }));
  expect(latestChannel?.close).not.toHaveBeenCalled();
  expect(latestPeerClose).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalledOnce();

  await act(async () => latestChannel?.emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 5 } }));
  expect(latestChannel?.close).toHaveBeenCalledOnce();
  expect(latestPeerClose).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
});

it("explains a denied microphone permission without creating a server session", async () => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")) } });
  vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(<AssistantLiveVoice conversationId={null} disabled={false} onBusyChange={vi.fn()} onConversationStarted={vi.fn()} onConversationUpdated={vi.fn()} />));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Démarrer le mode vocal"]')?.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Autorise l’accès au microphone");
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
