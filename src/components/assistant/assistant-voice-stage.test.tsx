// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { AssistantWorkspace } from "./assistant-workspace";

vi.mock("./assistant-live-voice", () => ({
  AssistantLiveVoice: ({ onPresentationChange }: { onPresentationChange: (value: unknown) => void }) => <>
    <button type="button" onClick={() => onPresentationChange({ phase: "active", userCaption: "Quel était mon dernier squat ?", assistantCaption: "Ta dernière série enregistrée…", muted: false })}>Démarrer le vocal simulé</button>
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
