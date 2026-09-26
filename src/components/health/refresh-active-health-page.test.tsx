// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { RefreshActiveHealthPage } from "./refresh-active-health-page";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.useRealTimers();
  refresh.mockClear();
  document.body.innerHTML = "";
});

it("refreshes an open activity page as new daily measurements arrive", async () => {
  vi.useFakeTimers();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<RefreshActiveHealthPage />));

  await act(async () => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(1);

  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(refresh).toHaveBeenCalledTimes(2);

  await act(async () => root.unmount());
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
});
