import { describe, expect, it } from "vitest";

import { withServerTiming } from "./performance";

describe("server timing headers", () => {
  it("serializes finite, safe timing entries without exposing request data", () => {
    const response = withServerTiming(new Response("ok"), [
      { name: "auth", durationMs: 1.234 },
      { name: "loader", durationMs: 42 },
      { name: "user-id", durationMs: Number.NaN },
      { name: "bad value", durationMs: 10 },
    ]);

    expect(response.headers.get("Server-Timing")).toBe("auth;dur=1.2, loader;dur=42.0");
  });

  it("clamps negative durations to zero", () => {
    const response = withServerTiming(new Response(), [{ name: "total", durationMs: -4 }]);

    expect(response.headers.get("Server-Timing")).toBe("total;dur=0.0");
  });
});
