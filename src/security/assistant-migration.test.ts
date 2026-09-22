import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260922120000_assistant_foundation.sql", import.meta.url), "utf8");
const accountExport = readFileSync(new URL("../app/api/account/export/route.ts", import.meta.url), "utf8");

const assistantTables = [
  "assistant_conversations", "assistant_messages", "assistant_runs", "assistant_tool_calls",
  "assistant_memories", "assistant_goal_sets", "assistant_goals", "assistant_plans",
  "assistant_plan_versions", "assistant_attachments", "assistant_actions", "assistant_action_events",
];

describe("assistant database security contract", () => {
  it("keeps assistant rows tenant-owned, owner-readable, and service-written", () => {
    expect(migration).toMatch(/user_id text not null references public\.soma_users\(id\) on delete cascade/i);
    for (const table of assistantTables) {
      expect(migration).toContain(`'${table}'`);
      expect(migration).toMatch(new RegExp(`create policy %I on public\\.%I for select to authenticated using \\(public\\.owns_soma_user\\(user_id\\)\\)`, "i"));
    }
    expect(migration).toMatch(/revoke all on table public\.%I from anon, authenticated/i);
    expect(migration).toMatch(/grant select, insert, update, delete on table public\.%I to service_role/i);
  });

  it("uses composite tenant foreign keys and cascades conversation metadata", () => {
    expect(migration).toMatch(/foreign key \(user_id, conversation_id\)[\s\S]*assistant_conversations\(user_id, id\) on delete cascade/i);
    expect(migration).toMatch(/foreign key \(user_id, conversation_id, message_id\)[\s\S]*assistant_messages\(user_id, conversation_id, id\) on delete set null/i);
    expect(migration).toMatch(/foreign key \(user_id, action_id\)[\s\S]*assistant_actions\(user_id, id\) on delete cascade/i);
  });

  it("keeps run creation service-only and idempotent", () => {
    expect(migration).toMatch(/create or replace function public\.create_assistant_run/i);
    expect(migration).toMatch(/on conflict \(user_id, request_id\) do nothing/i);
    expect(migration).toMatch(/request id was reused with different input/i);
    expect(migration).toMatch(/revoke all on function public\.create_assistant_run[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.create_assistant_run[\s\S]*to service_role/i);
  });

  it("binds attachment object paths to the owner and conversation prefix", () => {
    expect(migration).toContain("'assistant/' || user_id || '/' || conversation_id::text || '/'");
    expect(migration).toMatch(/position\('\.\.' in object_path\) = 0/i);
  });

  it("includes every assistant table in account exports", () => {
    for (const table of assistantTables) expect(accountExport).toContain(`"${table}"`);
  });
});
