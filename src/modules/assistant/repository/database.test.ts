import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantDatabaseRequest } from "./database";

describe("assistant database client", () => {
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
  });

  it("fails closed without server configuration", async () => {
    await expect(assistantDatabaseRequest("assistant_conversations")).rejects.toThrow(/not configured/);
  });

  it("uses the service credential only in server request headers", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "conversation-1" }]), { status: 200 }));
    await assistantDatabaseRequest("assistant_conversations?select=id", { fetchImpl });
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/assistant_conversations?select=id");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer service-secret");
    expect(url).not.toContain("service-secret");
  });

  it("does not expose provider response bodies in errors", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    const fetchImpl = vi.fn().mockResolvedValue(new Response("private database detail", { status: 400 }));
    await expect(assistantDatabaseRequest("assistant_conversations", { fetchImpl })).rejects.not.toThrow(/private database detail/);
  });
});
