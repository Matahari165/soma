import { describe, expect, it } from "vitest";

import { getGoogleHealthNotice } from "./status";

describe("Google Health connection notices", () => {
  it("keeps an OAuth refusal separate from a technical failure", () => {
    expect(getGoogleHealthNotice("permission_denied")).toMatchObject({ tone: "neutral" });
    expect(getGoogleHealthNotice("connection_failed")).toMatchObject({ tone: "error" });
  });

  it("explains that onboarding data is preserved during an outage", () => {
    expect(getGoogleHealthNotice("unavailable")?.message).toContain("profile is saved");
  });

  it("ignores unknown query values", () => {
    expect(getGoogleHealthNotice("unexpected")).toBeNull();
  });
});
