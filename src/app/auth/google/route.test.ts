import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const signInWithOAuth = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  signInWithOAuth.mockReset();
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { signInWithOAuth } } as never);
  signInWithOAuth.mockResolvedValue({ data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, error: null });
});

describe("Google OAuth start route", () => {
  it("keeps a Supabase failure inside the Soma login experience", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "upstream failure" }), { status: 500 }));

    const response = await GET(new Request("https://soma.example/auth/google"));

    expect(response.headers.get("location")).toBe("https://soma.example/login?error=auth_service");
  });

  it("continues only to the Google Accounts OAuth host", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=test" }));

    const response = await GET(new Request("https://soma.example/auth/google"));

    expect(response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=test");
    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google",
      options: expect.objectContaining({ redirectTo: "https://soma.example/auth/callback", skipBrowserRedirect: true }),
    }));
  });

  it("rejects an unexpected redirect host", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ url: "https://example.com/pretend-google" }));

    const response = await GET(new Request("https://soma.example/auth/google"));

    expect(response.headers.get("location")).toBe("https://soma.example/login?error=auth_service");
  });
});

