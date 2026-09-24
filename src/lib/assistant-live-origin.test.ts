import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAssistantLiveOriginAllowed } from "@/lib/assistant-live-origin";

function request(url: string, headers: HeadersInit = {}) {
  return new Request(url, { method: "POST", headers });
}

describe("assistant Live origin protection", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SOMA_LOCAL_PREVIEW", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts the browser origin forwarded as the local request Host", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/sessions", {
      Origin: "http://localhost:54354",
      Host: "localhost:54354",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(true);
  });

  it("accepts one loopback forwarded authority when the internal Host remains local", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/delegations", {
      Origin: "http://localhost:54354",
      Host: "localhost:3001",
      "X-Forwarded-Host": "localhost:54354",
      "X-Forwarded-Proto": "http",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(true);
  });

  it("uses the internal request scheme when the local proxy omits X-Forwarded-Proto", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/delegations", {
      Origin: "http://localhost:54354",
      Host: "localhost:3001",
      "X-Forwarded-Host": "localhost:54354",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(true);
  });

  it("rejects forwarded authorities outside the loopback allowlist", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/sessions", {
      Origin: "https://attacker.example",
      Host: "localhost:3001",
      "X-Forwarded-Host": "attacker.example",
      "X-Forwarded-Proto": "https",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(false);
  });

  it("does not let a forwarded loopback host override a public Host", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/sessions", {
      Origin: "http://localhost:54354",
      Host: "attacker.example",
      "X-Forwarded-Host": "localhost:54354",
      "X-Forwarded-Proto": "http",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(false);
  });

  it("rejects ambiguous forwarded host and protocol chains", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/sessions", {
      Origin: "http://localhost:54354",
      Host: "localhost:3001",
      "X-Forwarded-Host": "localhost:54354, attacker.example",
      "X-Forwarded-Proto": "http, https",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(false);
  });

  it("does not accept public hosts through a local Host header", () => {
    const incoming = request("http://localhost:3001/api/assistant/live/sessions", {
      Origin: "https://attacker.example",
      Host: "attacker.example",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(false);
  });

  it("does not trust forwarded headers outside local preview mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    const incoming = request("http://localhost:3001/api/assistant/live/sessions", {
      Origin: "http://localhost:54354",
      Host: "localhost:3001",
      "X-Forwarded-Host": "localhost:54354",
      "X-Forwarded-Proto": "http",
    });

    expect(isAssistantLiveOriginAllowed(incoming)).toBe(false);
  });

  it("requires same-origin Fetch Metadata when Origin is absent", () => {
    expect(isAssistantLiveOriginAllowed(request("http://localhost:3001", { "Sec-Fetch-Site": "same-origin" }))).toBe(true);
    expect(isAssistantLiveOriginAllowed(request("http://localhost:3001", { "Sec-Fetch-Site": "cross-site" }))).toBe(false);
    expect(isAssistantLiveOriginAllowed(request("http://localhost:3001"))).toBe(false);
  });

  it("rejects Origin values containing a path or credentials", () => {
    expect(isAssistantLiveOriginAllowed(request("http://localhost:3001", { Origin: "http://localhost:54354/path", Host: "localhost:54354" }))).toBe(false);
    expect(isAssistantLiveOriginAllowed(request("http://localhost:3001", { Origin: "http://user@localhost:54354", Host: "localhost:54354" }))).toBe(false);
  });
});
