// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { AssistantWorkspace } from "./assistant-workspace";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("reveals edit only after a stationary long press and dismisses it on an outside tap", async () => {
  const original = { id: "user-1", sequence: 1, role: "user", status: "completed", parts: [{ type: "text", text: "Question" }] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [] });
    if (url.includes("conversationId=conversation-1")) return Response.json({ messages: [original] });
    return Response.json({ conversations: [{ id: "conversation-1", title: "Test" }] });
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const conversationButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Test");
  await act(async () => conversationButton?.click());
  const item = container.querySelector<HTMLElement>("[data-edit-message-id='user-1']");
  const body = item?.querySelector("div");
  const pointer = (type: string, x: number) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, {
      pointerType: { value: "touch" }, pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: 0 },
    });
    return event;
  };

  vi.useFakeTimers();
  await act(async () => body?.dispatchEvent(pointer("pointerdown", 0)));
  await act(async () => vi.advanceTimersByTime(499));
  expect(item?.getAttribute("data-edit-revealed")).toBeNull();
  await act(async () => body?.dispatchEvent(pointer("pointermove", 20)));
  await act(async () => vi.advanceTimersByTime(1));
  expect(item?.getAttribute("data-edit-revealed")).toBeNull();

  await act(async () => body?.dispatchEvent(pointer("pointerdown", 0)));
  await act(async () => vi.advanceTimersByTime(500));
  expect(item?.getAttribute("data-edit-revealed")).toBe("true");
  await act(async () => document.body.dispatchEvent(pointer("pointerdown", 0)));
  expect(item?.getAttribute("data-edit-revealed")).toBeNull();
  await act(async () => root.unmount());
});

it("sends a deterministic starter immediately without copying it into the composer", async () => {
  const question = "Que montrent mes dernières données ?";
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [
      { id: "one", text: question }, { id: "two", text: "Deuxième question" }, { id: "three", text: "Troisième question" },
    ] });
    if (url.endsWith("/conversations") && init?.method === "POST") return Response.json({ conversation: { id: "conversation-1" } });
    if (url.endsWith("/chat")) {
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      return Response.json({ userMessage: { id: "user-1", sequence: 1, role: "user", status: "completed", parts: [{ type: "text", text: question }] }, assistantMessage: { id: "answer-1", sequence: 2, role: "assistant", status: "completed", parts: [{ type: "text", text: "Réponse" }] } });
    }
    return Response.json({ conversations: [] });
  }));

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const starter = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(question));
  expect(starter).toBeDefined();
  await act(async () => starter?.click());

  expect(requests).toHaveLength(1);
  expect(requests[0].body.text).toBe(question);
  expect(container.textContent).not.toContain("Troisième question");
  await act(async () => root.unmount());
});

it("edits a previous message inline and uses the existing edit request", async () => {
  const requests: Record<string, unknown>[] = [];
  const original = { id: "user-1", sequence: 1, role: "user", status: "completed", parts: [{ type: "text", text: "Ancienne question" }] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [] });
    if (url.includes("conversationId=conversation-1")) return Response.json({ messages: [original] });
    if (url.endsWith("/chat")) {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ conversationId: "conversation-2", userMessage: { ...original, id: "user-2", parts: [{ type: "text", text: "Question corrigée" }] }, assistantMessage: { id: "answer-2", sequence: 2, role: "assistant", status: "completed", parts: [{ type: "text", text: "Réponse" }] } });
    }
    return Response.json({ conversations: [{ id: "conversation-1", title: "Test" }] });
  }));

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const conversationButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Test");
  await act(async () => conversationButton?.click());
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Modifier ce message']")?.click());

  const editor = container.querySelector<HTMLTextAreaElement>("[id^='edit-']");
  expect(editor?.value).toBe("Ancienne question");
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(editor, "Question corrigée");
  await act(async () => editor?.dispatchEvent(new Event("input", { bubbles: true })));
  const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Enregistrer et envoyer"));
  await act(async () => save?.click());

  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ editMessageId: "user-1", text: "Question corrigée" });
  await act(async () => root.unmount());
});

it("reuses the request id and restores the persisted turn after a lost response", async () => {
  const question = "Question après une réponse réseau perdue";
  const requests: Array<Record<string, unknown>> = [];
  let persistedMessages: Array<Record<string, unknown>> = [];
  let chatCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [] });
    if (url.includes("conversationId=conversation-1")) return Response.json({ messages: persistedMessages });
    if (url.endsWith("/chat")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      chatCalls += 1;
      if (chatCalls === 1) {
        persistedMessages = [
          { id: "user-1", conversationId: "conversation-1", sequence: 1, role: "user", status: "completed", parts: [{ type: "text", text: question }] },
          { id: "answer-1", conversationId: "conversation-1", sequence: 2, role: "assistant", status: "completed", parts: [{ type: "text", text: "Réponse enregistrée" }] },
        ];
        throw new TypeError("Network response was lost after persistence.");
      }
      return Response.json({ userMessage: persistedMessages[0], assistantMessage: persistedMessages[1], replayed: true });
    }
    return Response.json({ conversations: [{ id: "conversation-1", title: "Test" }] });
  }));

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const conversationButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Test");
  await act(async () => conversationButton?.click());

  const composer = container.querySelector<HTMLTextAreaElement>("#assistant-message");
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(composer, question);
  await act(async () => composer?.dispatchEvent(new Event("input", { bubbles: true })));
  const send = container.querySelector<HTMLButtonElement>("form button[type='submit']");
  await act(async () => send?.click());
  expect(container.textContent).toContain("Réponse enregistrée");
  expect(requests).toHaveLength(1);

  await act(async () => send?.click());

  expect(requests).toHaveLength(2);
  expect(requests[1]?.requestId).toBe(requests[0]?.requestId);
  expect(container.querySelectorAll("[data-edit-message-id='user-1']")).toHaveLength(1);
  expect(container.textContent?.match(/Réponse enregistrée/g)).toHaveLength(1);
  await act(async () => root.unmount());
});

it("offers a retry when a conversation cannot be loaded", async () => {
  let loadAttempts = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [] });
    if (url.includes("conversationId=conversation-1")) {
      loadAttempts += 1;
      if (loadAttempts === 1) return Response.json({ error: "Service indisponible" }, { status: 503 });
      return Response.json({ messages: [{
        id: "answer-1", sequence: 2, role: "assistant", status: "completed", parts: [{ type: "text", text: "Conversation rechargée." }],
      }] });
    }
    return Response.json({ conversations: [{ id: "conversation-1", title: "Test" }] });
  }));

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const conversationButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Test");
  await act(async () => conversationButton?.click());

  expect(loadAttempts).toBe(1);
  expect(container.textContent).toContain("Conversation indisponible");
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Réessayer");
  expect(retry).toBeDefined();
  await act(async () => retry?.click());

  expect(loadAttempts).toBe(2);
  expect(container.textContent).toContain("Conversation rechargée.");
  expect(container.textContent).not.toContain("Conversation indisponible");
  await act(async () => root.unmount());
});

it("distinguishes new search coverage from legacy summaries without coverage", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [] });
    if (url.includes("conversationId=conversation-1")) return Response.json({ messages: [
      {
        id: "answer-legacy", sequence: 2, role: "assistant", status: "completed", parts: [
          { type: "text", text: "Les données historiques restent disponibles." },
          { type: "data-summary", label: "Données Soma consultées", period: { from: "2026-09-24", to: "2026-09-24" }, itemCount: 4, domains: ["effort"] },
        ],
      },
      {
        id: "answer-empty", sequence: 4, role: "assistant", status: "completed", parts: [
          { type: "text", text: "Aucune course aujourd’hui." },
          { type: "data-summary", label: "Données Soma consultées", period: { from: "2026-09-24", to: "2026-09-24" }, coveredPeriod: null, itemCount: 0, domains: ["effort"] },
        ],
      },
    ] });
    return Response.json({ conversations: [{ id: "conversation-1", title: "Course" }] });
  }));

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const conversationButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Course");
  await act(async () => conversationButton?.click());

  const summaries = Array.from(container.querySelectorAll("details")).filter((summary) =>
    summary.querySelector("summary")?.textContent?.includes("Données Soma consultées"),
  );
  expect(summaries).toHaveLength(2);
  const legacyLabels = Array.from(summaries[0].querySelectorAll("dt"), (label) => label.textContent);
  expect(legacyLabels).toContain("Période");
  expect(legacyLabels).not.toContain("Trouvé");
  const newLabels = Array.from(summaries[1].querySelectorAll("dt"), (label) => label.textContent);
  expect(newLabels).toContain("Recherche");
  expect(newLabels).toContain("Trouvé");
  expect(container.textContent).toContain("24 sept. 2026");
  expect(container.textContent).toContain("Aucune donnée sur cette période");
  await act(async () => root.unmount());
});

it("labels a failed new conversation request as a send error", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [{ id: "test", text: "Question de test" }, { id: "two", text: "Deuxième question" }, { id: "three", text: "Troisième question" }] });
    if (init?.method === "POST") return Response.json({ error: "Service indisponible" }, { status: 503 });
    return Response.json({ conversations: [] });
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const starter = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Question de test"));
  expect(starter).toBeDefined();
  await act(async () => starter?.click());
  expect(container.textContent).toContain("Envoi impossible");
  expect(container.textContent).not.toContain("Conversation indisponible");
  await act(async () => root.unmount());
});
