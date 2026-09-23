import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  userExists: true,
  deleteUserFails: false,
  r2Fails: false,
  deletedPaths: [] as string[],
}));

vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/lab-matrix-cache", () => ({ labMatrixCacheObjectKeys: () => ["lab-cache"] }));
vi.mock("@/lib/r2", () => ({
  deleteR2Object: vi.fn(async (path: string) => {
    state.deletedPaths.push(path);
    if (state.r2Fails) throw new Error("R2 unavailable");
  }),
}));
vi.mock("@/lib/cloudflare/db", () => ({
  hasSupabaseRuntime: () => true,
  cloudflareDb: vi.fn(),
  createCloudflareAdminClient: () => ({
    auth: { admin: { deleteUser: async () => {
      if (state.deleteUserFails) return { error: { message: "DB unavailable" } };
      state.userExists = false;
      return { error: null };
    } } },
    from: (table: string) => {
      let operation: "read" | "insert" | "update" | "delete" = "read";
      let values: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => query,
        insert: (input: Record<string, unknown>) => { operation = "insert"; values = input; return query; },
        update: (input: Record<string, unknown>) => { operation = "update"; values = input; return query; },
        delete: () => { operation = "delete"; return query; },
        then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
          if (table === "account_deletion_jobs") {
            if (operation === "insert") state.job = values;
            if (operation === "update" && state.job) state.job = { ...state.job, ...values };
            if (operation === "delete") state.job = null;
            return Promise.resolve(resolve({ data: operation === "read" ? state.job ? [state.job] : [] : null, error: null }));
          }
          if (table === "soma_users") return Promise.resolve(resolve({ data: state.userExists ? { id: "user-1" } : null, error: null }));
          const paths = table === "meal_photos" ? [{ object_path: "meal-photo" }] : [];
          return Promise.resolve(resolve({ data: paths, error: null }));
        },
      };
      return query;
    },
  }),
}));

import { accountDeletionConfirmation, deleteAccountData, reconcileAccountDeletionJobs } from "./account-deletion";

describe("durable account deletion", () => {
  beforeEach(() => {
    state.job = null;
    state.userExists = true;
    state.deleteUserFails = false;
    state.r2Fails = false;
    state.deletedPaths = [];
  });

  it("keeps private objects when deleting the account fails", async () => {
    state.deleteUserFails = true;
    expect(await deleteAccountData("user-1", accountDeletionConfirmation)).toMatchObject({ ok: false, status: 500 });
    expect(state.job).toMatchObject({ status: "pending", account_user_id: "user-1" });
    expect(state.deletedPaths).toEqual([]);
    expect(await reconcileAccountDeletionJobs()).toBe(0);
    expect(state.deletedPaths).toEqual([]);
  });

  it("retries private object cleanup after the account has gone", async () => {
    state.r2Fails = true;
    expect(await deleteAccountData("user-1", accountDeletionConfirmation)).toEqual({ ok: true, cleanupPending: true });
    expect(state.job).toMatchObject({ status: "account_deleted" });
    state.r2Fails = false;
    expect(await reconcileAccountDeletionJobs()).toBe(1);
    expect(state.job).toBeNull();
    expect(state.deletedPaths).toContain("meal-photo");
  });
});
