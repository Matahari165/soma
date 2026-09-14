import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDurationMinutes,
  formatNumber,
} from "./locale";

describe("locale helpers", () => {
  it("formats numbers with French separators and keeps unavailable values visible", () => {
    expect(formatNumber(12345.6)).toBe("12 345,6");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(0)).toBe("0");
  });

  it("formats dates and date-times in French", () => {
    expect(formatDate("2026-09-14", { dateStyle: "medium" })).toBe(
      "14 sept. 2026",
    );
    expect(formatDateTime("2026-09-14T08:05:00+02:00")).toContain(
      "14 sept. 2026",
    );
    expect(formatDate(null)).toBe("—");
  });

  it("formats durations and plurals without turning null into zero", () => {
    expect(formatDurationMinutes(480.6)).toBe("8 h 1 min");
    expect(formatDurationMinutes(0)).toBe("0 h 0 min");
    expect(formatDurationMinutes(null)).toBe("—");
    expect(formatCount(1, "jour", "jours")).toBe("1 jour");
    expect(formatCount(2, "jour", "jours")).toBe("2 jours");
    expect(formatCount(null, "jour", "jours")).toBe("—");
  });
});
