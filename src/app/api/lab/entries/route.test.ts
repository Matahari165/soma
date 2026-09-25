import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const isLocalPreviewMode = vi.hoisted(() => vi.fn());
const createCloudflareAdminClient = vi.hoisted(() => vi.fn());
const loadJournalData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode }));
vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient }));
vi.mock("@/services/journal", () => ({ loadJournalData }));

import { PUT } from "./route";

const variableId = "00000000-0000-4000-8000-000000000001";
const entryDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function request() {
  return new Request("https://soma.example/api/lab/entries", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryDate, mode: "validate", entries: [{ variableId, value: true }] }),
  });
}

describe("journal day validation API", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "test-user" });
    isLocalPreviewMode.mockReturnValue(false);
    loadJournalData.mockResolvedValue({ variables: [{ id: variableId, name: "Breakfast", variableType: "boolean", isActive: true }] });
    const query = (table: string) => ({
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => table === "profiles"
        ? { data: { timezone: "Europe/Paris" }, error: null }
        : { data: { status: "draft" }, error: null },
    });
    createCloudflareAdminClient.mockReturnValue({ from: query, rpc });
    rpc.mockResolvedValue({ error: null });
  });

  it("reports validated only after the journal save succeeds", async () => {
    const response = await PUT(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "validated", saved: 1 });
    expect(rpc).toHaveBeenCalledWith("save_personal_lab_journal_day", {
      p_user_id: "test-user",
      p_entry_date: entryDate,
      p_entries: [{ variable_id: variableId, value: true }],
      p_validate: true,
      p_replace_omissions: true,
    });
  });

  it("does not report validated when the journal save fails", async () => {
    rpc.mockResolvedValue({ error: { message: "test failure" } });

    const response = await PUT(request());

    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("status", "validated");
  });
});
