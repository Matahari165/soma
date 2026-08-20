import { describe, expect, it } from "vitest";

import { minutesSinceMidnightIn } from "./analysis";

describe("civil-time health analysis", () => {
  it("uses the profile timezone instead of the server timezone", () => {
    expect(minutesSinceMidnightIn("2026-08-20T21:30:00.000Z", "Europe/Paris")).toBe(23 * 60 + 30);
    expect(minutesSinceMidnightIn("2026-08-20T21:30:00.000Z", "America/New_York")).toBe(17 * 60 + 30);
  });

  it("follows daylight-saving transitions", () => {
    expect(minutesSinceMidnightIn("2026-03-29T00:30:00.000Z", "Europe/Paris")).toBe(90);
    expect(minutesSinceMidnightIn("2026-03-29T01:30:00.000Z", "Europe/Paris")).toBe(210);
  });
});
