// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { AssistantWorkspace } from "./assistant-workspace";

vi.mock("./assistant-live-voice", () => ({
  AssistantLiveVoice: ({ onPresentationChange, onConversationStarted, onConversationUpdated }: { onPresentationChange: (value: unknown) => void; onConversationStarted: (id: string) => void; onConversationUpdated: (id: string) => void }) => <>
    <button type="button" onClick={() => onPresentationChange({ phase: "active", userCaption: "Quel était mon dernier squat ?", assistantCaption: "Ta dernière série enregistrée…", muted: false, error: null })}>Démarrer le vocal simulé</button>
    <button type="button" onClick={() => onPresentationChange({ phase: "active", userCaption: "Analyse mes courses.", assistantCaption: "", muted: false, error: "La demande a échoué." })}>Simuler une erreur vocale</button>
    <button type="button" onClick={() => onConversationStarted("11111111-1111-4111-8111-111111111111")}>Créer la conversation vocale</button>
    <button type="button" onClick={() => onConversationUpdated("11111111-1111-4111-8111-111111111111")}>Actualiser la réponse vocale</button>
    <button type="button" onClick={() => onPresentationChange(null)}>Terminer le vocal simulé</button>
  </>,
}));

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it("shows live speech on the main screen and restores the conversation after closing", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/starter-prompts")
    ? Response.json({ calibrated: true, prompts: [] })
    : Response.json({ conversations: [] })));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace />));
  const start = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Démarrer le vocal simulé");
  await act(async () => start?.click());
  const stage = container.querySelector('[aria-label="Conversation vocale en cours"]');
  expect(stage?.textContent).toContain("Quel était mon dernier squat ?");
  expect(stage?.textContent).toContain("Ta dernière série enregistrée…");
  expect(container.querySelector<HTMLTextAreaElement>("#assistant-message")?.value).toBe("");
  const stop = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Terminer le vocal simulé");
  await act(async () => stop?.click());
  expect(container.querySelector('[aria-label="Conversation vocale en cours"]')).toBeNull();
  await act(async () => root.unmount());
});

it("shows the full saved analysis and its data summary while voice is active", async () => {
  let conversationReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/starter-prompts")) return Response.json({ calibrated: true, prompts: [] });
    if (url.includes("conversationId=")) {
      conversationReads += 1;
      return Response.json({ messages: conversationReads === 1 ? [] : [{
        id: "answer-1", sequence: 2, role: "assistant", status: "completed",
        parts: [
          { type: "text", text: "## Course\n- 3 séances cette semaine\n- 18 km parcourus" },
          { type: "data-summary", label: "Course sur trois semaines", period: { from: "2026-09-03", to: "2026-09-24" }, itemCount: 9, domains: ["effort"] },
        ],
      }] });
    }
    return Response.json({ conversations: [] });
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantWorkspace previewMode />));
  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
    await act(async () => button?.click());
  };
  await click("Démarrer le vocal simulé");
  await click("Créer la conversation vocale");
  await click("Actualiser la réponse vocale");
  const stage = container.querySelector('[aria-label="Conversation vocale en cours"]');
  expect(stage?.textContent).toContain("données de démonstration");
  expect(stage?.textContent).toContain("3 séances cette semaine");
  expect(stage?.textContent).toContain("18 km parcourus");
  expect(stage?.textContent).toContain("Course sur trois semaines");
  expect(stage?.textContent).toContain("9 éléments");
  await click("Simuler une erreur vocale");
  expect(stage?.querySelector('[role="alert"]')?.textContent).toBe("La demande a échoué.");
  await act(async () => root.unmount());
});
