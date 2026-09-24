// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { AssistantDictation } from "./assistant-dictation";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("records, stops the microphone and puts the completed transcript in the composer callback", async () => {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  class Recorder {
    static isTypeSupported(type: string) { return type === "audio/webm"; }
    state: RecordingState = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {}
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: "audio/webm" }) } as BlobEvent);
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ text: "Courir demain matin." }));
  vi.stubGlobal("fetch", fetchMock);
  const onTranscript = vi.fn();
  const onBusyChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(<AssistantDictation disabled={false} onBusyChange={onBusyChange} onTranscript={onTranscript} />));
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Dicter un message']")?.click());
  expect(container.textContent).toContain("Enregistrement");
  const recording = container.querySelector('[data-phase="recording"]');
  expect(recording?.children[0]?.getAttribute("aria-label")).toBe("Annuler la dictée");
  expect(recording?.children[1]?.querySelectorAll("span")).toHaveLength(36);
  expect(recording?.children[3]?.getAttribute("aria-label")).toBe("Arrêter et transcrire");
  expect(recording?.children[4]?.getAttribute("aria-label")).toBe("Arrêter, transcrire et envoyer");
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Arrêter et transcrire']")?.click());

  expect(stopTrack).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith("/api/assistant/transcriptions", expect.objectContaining({ method: "POST" }));
  expect(onTranscript).toHaveBeenCalledWith("Courir demain matin.", false);
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Dicter un message']")?.click());
  expect(container.querySelector("[aria-label='Arrêter, transcrire et envoyer']")).not.toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Arrêter, transcrire et envoyer']")?.click());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(onTranscript).toHaveBeenCalledWith("Courir demain matin.", true));
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  await act(async () => root.unmount());
});

it("explains when microphone permission is refused without uploading audio", async () => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) } });
  vi.stubGlobal("MediaRecorder", class { static isTypeSupported() { return true; } });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantDictation disabled={false} onBusyChange={vi.fn()} onTranscript={vi.fn()} />));
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Dicter un message']")?.click());
  expect(container.querySelector("[role='alert']")?.textContent).toContain("Autorise le micro");
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it("makes the waveform visibly respond to speech and settle during silence", async () => {
  let sampleLevel = .03;
  let frame: FrameRequestCallback | undefined;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
  vi.stubGlobal("MediaRecorder", class {
    static isTypeSupported(type: string) { return type === "audio/webm"; }
    state = "inactive";
    onstop: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.onstop?.(); }
  });
  vi.stubGlobal("AudioContext", class {
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect: vi.fn() }; }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(sampleLevel) }; }
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AssistantDictation disabled={false} onBusyChange={vi.fn()} onTranscript={vi.fn()} />));
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Dicter un message']")?.click());
  for (let index = 0; index < 10; index += 1) await act(async () => frame?.(index * 16));
  const bar = container.querySelector<HTMLElement>('[data-phase="recording"] span[aria-hidden="true"] span');
  expect(Number(bar?.style.getPropertyValue("--level"))).toBeGreaterThan(.5);
  sampleLevel = 0;
  await act(async () => frame?.(160));
  expect(Number(bar?.style.getPropertyValue("--level"))).toBeGreaterThan(.4);
  for (let index = 11; index < 45; index += 1) await act(async () => frame?.(index * 16));
  expect(Number(bar?.style.getPropertyValue("--level"))).toBeLessThan(.3);
  await act(async () => root.unmount());
});
