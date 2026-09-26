import { afterEach, describe, expect, it, vi } from "vitest";

import { isLocalPreviewMode, isObservatoryMode, isRemoteDemoPreviewMode } from "@/lib/env";

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

  it("enables the synthetic preview only for its Vercel preview branch", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/mobile-bottom-navigation-20260925");
    vi.stubEnv("SOMA_TEST_PREVIEW", "true");
    expect(isRemoteDemoPreviewMode()).toBe(true);
    expect(isLocalPreviewMode()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isLocalPreviewMode()).toBe(false);
  });
});

describe("application visual mode", () => {
  it("keeps the dark Observatoire shell as the only interface", () => {
    expect(isObservatoryMode()).toBe(true);
  });
});
