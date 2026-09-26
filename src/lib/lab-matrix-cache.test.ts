import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cloudflare/db", () => ({ cloudflareArchives: vi.fn() }));
vi.mock("@/lib/r2", () => ({ getR2JsonObject: vi.fn(), putR2JsonObject: vi.fn() }));

import { LAB_MATRIX_CACHE_VERSION, labMatrixCacheObjectKey, labMatrixCacheObjectKeys } from "./lab-matrix-cache";

describe("lab matrix cache object keys", () => {
  it("invalidates matrices created with the previous statistical method", () => {
    expect(LAB_MATRIX_CACHE_VERSION).toBe("matrix-v19");
  });

  it("keeps stable keys across algorithm versions and escapes the user id", () => {
    expect(labMatrixCacheObjectKey("user/a", "30")).toBe("lab-matrix-cache/user%2Fa/30.json");
  });

  it("enumerates every cache object deleted with an account", () => {
    expect(labMatrixCacheObjectKeys("user-1")).toEqual([
      "lab-matrix-cache/user-1/15.json",
      "lab-matrix-cache/user-1/30.json",
      "lab-matrix-cache/user-1/90.json",
      "lab-matrix-cache/user-1/all.json",
    ]);
  });
});
