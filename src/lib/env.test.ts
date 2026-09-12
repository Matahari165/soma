import { afterEach, describe, expect, it, vi } from "vitest";

import { isLocalPreviewMode, isObservatoryMode } from "@/lib/env";

describe("local preview mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("can be enabled outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SOMA_LOCAL_PREVIEW", "true");
    expect(isLocalPreviewMode()).toBe(true);
  });

  it("stays disabled in production even when the flag is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOMA_LOCAL_PREVIEW", "true");
    expect(isLocalPreviewMode()).toBe(false);
  });
});

describe("application visual mode", () => {
  it("keeps the dark Observatoire shell as the only interface", () => {
    expect(isObservatoryMode()).toBe(true);
  });
});
