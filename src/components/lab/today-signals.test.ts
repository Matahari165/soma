import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TodaySignals } from "./today-signals";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("Today signals", () => {
  it("shows exactly Sleep, Recovery, and Effort with the working activity link", () => {
    const html = renderToStaticMarkup(createElement(TodaySignals, { initial: { sleepMinutes: 510, recoveryScore: 72, effortScore: 63, overnightFingerprint: null } }));
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain('href="/sleep"');
    expect(html).toContain('href="/recovery"');
    expect(html).toContain('href="/activity"');
    expect(html).not.toContain('href="/effort"');
  });
});
