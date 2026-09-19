import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getNativeEffort } from "@/services/native-effort";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/services/native-effort", () => ({ getNativeEffort: vi.fn() }));

import { GET } from "./route";

describe("native Effort API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a Bearer session", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns private, uncached Effort data for the authenticated user", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue({ id: "synthetic-user", email: null, displayName: "Test" });
    vi.mocked(getNativeEffort).mockResolvedValue({ timezone: "Europe/Zurich" } as Awaited<ReturnType<typeof getNativeEffort>>);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getNativeEffort).toHaveBeenCalledWith("synthetic-user");
  });
});
