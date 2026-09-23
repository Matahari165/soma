import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  userExists: true,
  deleteUserFails: false,
  r2Fails: false,
  deletedPaths: [] as string[],
  authUserId: null as string | null,
  physicalArchives: [] as Array<{ object_path: string; storage_backend: string; storage_bucket?: string }>,
  physicalAttachments: [] as Array<{ object_path: string }>,
  physicalFetchFails: false,
  storageFails: false,
  storageDeletes: [] as string[],
  archiveDeletes: [] as string[],
  authDeletes: [] as string[],
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
          if (table === "soma_users") return Promise.resolve(resolve({ data: state.userExists ? { id: "user-1", auth_user_id: state.authUserId } : null, error: null }));
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
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    state.job = null;
    state.userExists = true;
    state.deleteUserFails = false;
    state.r2Fails = false;
    state.deletedPaths = [];
    state.authUserId = null;
    state.physicalArchives = [];
    state.physicalAttachments = [];
    state.physicalFetchFails = false;
    state.storageFails = false;
    state.storageDeletes = [];
    state.archiveDeletes = [];
    state.authDeletes = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rest/v1/health_record_archives") && init?.method === "DELETE") {
        state.archiveDeletes.push(url);
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/v1/health_record_archives")) return state.physicalFetchFails ? Response.json({}, { status: 503 }) : Response.json(state.physicalArchives);
      if (url.includes("/rest/v1/assistant_attachments")) return Response.json(state.physicalAttachments);
      if (url.includes("/storage/v1/object/")) {
        state.storageDeletes.push(url);
        return state.storageFails ? Response.json({}, { status: 503 }) : Response.json([]);
      }
      if (url.includes("/auth/v1/admin/users/")) {
        state.authDeletes.push(url);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }));
    vi.stubEnv("SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  });

  it("keeps private objects when deleting the account fails", async () => {
    state.deleteUserFails = true;
    expect(await deleteAccountData("user-1", accountDeletionConfirmation)).toMatchObject({ ok: false, status: 500 });
    expect(state.job).toMatchObject({ status: "pending", account_user_id: "user-1" });
    expect(state.deletedPaths).toEqual([]);
    expect(await reconcileAccountDeletionJobs()).toBe(0);
    expect(state.deletedPaths).toEqual([]);
  });

  it("does not delete the account when physical archive discovery fails", async () => {
    state.authUserId = "11111111-1111-4111-8111-111111111111";
    state.physicalFetchFails = true;
    expect(await deleteAccountData("user-1", accountDeletionConfirmation)).toMatchObject({ ok: false, status: 500 });
    expect(state.userExists).toBe(true);
    expect(state.job).toBeNull();
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

  it("keeps physical archive paths and assistant attachments until both stores are cleared", async () => {
    state.authUserId = "11111111-1111-4111-8111-111111111111";
    state.physicalArchives = [
      { object_path: "legacy/archive.gz", storage_backend: "supabase", storage_bucket: "health-record-archives" },
      { object_path: "r2/old-archive.gz", storage_backend: "r2" },
    ];
    state.physicalAttachments = [{ object_path: "assistant/user-1/conversation/photo.jpg" }];
    state.storageFails = true;

    expect(await deleteAccountData("user-1", accountDeletionConfirmation)).toEqual({ ok: true, cleanupPending: true });
    expect(state.job).toMatchObject({ auth_user_ids: [state.authUserId], status: "account_deleted" });
    expect(state.deletedPaths).toContain("r2/old-archive.gz");
    expect(state.deletedPaths).toContain("assistant/user-1/conversation/photo.jpg");
    expect(state.archiveDeletes).toEqual([]);
    expect(state.authDeletes).toEqual([]);

    state.storageFails = false;
    expect(await reconcileAccountDeletionJobs()).toBe(1);
    expect(state.storageDeletes).toHaveLength(2);
    expect(state.archiveDeletes).toEqual([`https://supabase.test/rest/v1/health_record_archives?user_id=eq.${state.authUserId}`]);
    expect(state.authDeletes).toEqual([`https://supabase.test/auth/v1/admin/users/${state.authUserId}`]);
    expect(state.job).toBeNull();
  });
});
