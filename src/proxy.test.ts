import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy, requestBodyLimitForPath } from "@/proxy";

const previewState = vi.hoisted(() => ({ remote: false }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => previewState.remote, isRemoteDemoPreviewMode: () => previewState.remote }));

describe("remote demo preview", () => {
  beforeEach(() => { previewState.remote = true; });
  afterEach(() => { previewState.remote = false; });

  it("allows page navigation without a session", async () => {
    const response = await proxy(new NextRequest("https://preview.example/sleep"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/api/meals", "/api/assistant/chat", "/"])("blocks writes to %s", async (path) => {
    const response = await proxy(new NextRequest(`https://preview.example${path}`, { method: "POST" }));
    expect(response.status).toBe(403);
  });

  it("blocks real integration reads", async () => {
    const response = await proxy(new NextRequest("https://preview.example/api/cron/sync"));
    expect(response.status).toBe(403);
  });
});

describe("unauthenticated auth routes", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://soma.example"));
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/api/auth/register", "/api/auth/login"])("allows %s without a session", async (path) => {
    const response = await proxy(new NextRequest(`https://soma.example${path}`, {
      method: "POST",
      headers: { origin: "https://soma.example", host: "soma.example" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows the Web Apple Health sync token without a browser cookie", async () => {
    const token = "a".repeat(43);
    const response = await proxy(new NextRequest("https://soma.example/api/health/apple-sync", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, host: "soma.example" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still redirects unauthenticated private mutations", async () => {
    const response = await proxy(new NextRequest("https://soma.example/api/account", {
      method: "POST",
      headers: { origin: "https://soma.example", host: "soma.example" },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("still blocks cross-site registration requests", async () => {
    const response = await proxy(new NextRequest("https://soma.example/api/auth/register", {
      method: "POST",
      headers: { origin: "https://other.example", host: "soma.example" },
    }));

    expect(response.status).toBe(403);
  });
});

describe("requestBodyLimitForPath", () => {
  it("allows assistant photo uploads within the Vercel request limit", () => {
    expect(requestBodyLimitForPath("/api/assistant/attachments")).toBe(4 * 1024 * 1024 + 256 * 1024);
    expect(requestBodyLimitForPath("/api/assistant/transcriptions")).toBe(4 * 1024 * 1024 + 256 * 1024);
    expect(requestBodyLimitForPath("/api/assistant/live/sessions")).toBe(128 * 1024);
  });

  it("allows the bounded multipart meal photo route", () => {
    expect(requestBodyLimitForPath("/api/meals/meal-id/photos")).toBe(41 * 1024 * 1024);
    expect(requestBodyLimitForPath("/api/meals/analyze")).toBe(41 * 1024 * 1024);
  });

  it("keeps the strict default limit for other mutations and nested photo routes", () => {
    expect(requestBodyLimitForPath("/api/meals/meal-id")).toBe(64 * 1024);
    expect(requestBodyLimitForPath("/api/meals/meal-id/photos/photo-id")).toBe(64 * 1024);
  });
});
