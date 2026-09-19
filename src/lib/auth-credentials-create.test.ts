import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCloudflareAdminClient, hasSupabaseRuntime } from "@/lib/cloudflare/db";
import { createCredentialsUser } from "./auth-credentials";

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: vi.fn(),
  hasSupabaseRuntime: vi.fn(),
  cloudflareDb: vi.fn(),
}));

describe("Supabase email registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasSupabaseRuntime).mockReturnValue(true);
  });

  it("removes a newly created user when credential storage fails", async () => {
    const deleteById = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "soma_users") return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn(() => ({ eq: deleteById })),
        };
        if (table === "soma_credentials") return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          insert: vi.fn().mockResolvedValue({ error: { message: "credential storage failed" } }),
        };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createCloudflareAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createCloudflareAdminClient>);

    await expect(createCredentialsUser({ email: "test@example.com", password: "synthetic-password" }))
      .rejects.toThrow("credential storage failed");
    expect(deleteById).toHaveBeenCalledOnce();
    expect(deleteById).toHaveBeenCalledWith("id", expect.any(String));
  });
});
