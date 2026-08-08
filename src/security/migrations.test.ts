import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/migrations/20260808000000_complete_product_schema.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../../supabase/migrations/20260808130000_production_hardening.sql", import.meta.url), "utf8");
const schedule = readFileSync(new URL("../../supabase/setup/schedule_sync.sql", import.meta.url), "utf8");

describe("database security contract", () => {
  it("keeps OAuth connections and executable agent proposals server-only", () => {
    expect(schema).not.toMatch(/grant .*provider_connections.* to authenticated/i);
    expect(schema).not.toMatch(/grant .*agent_action_proposals.* to authenticated/i);
    expect(schema).not.toMatch(/policy provider_connections_owner/i);
    expect(schema).not.toMatch(/policy agent_actions_owner/i);
  });

  it("enables RLS on every health and workout table", () => {
    for (const table of ["health_records", "daily_health_metrics", "daily_scores", "insights", "correlation_results", "coach_threads", "workout_programs", "workout_sessions"]) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("explicitly denies application roles access to service-only resources", () => {
    for (const policy of ["provider_connections_server_only", "webhook_events_server_only", "agent_action_proposals_server_only"]) {
      expect(hardening).toContain(`create policy ${policy}`);
    }
    expect(hardening).toMatch(/revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated/i);
  });

  it("keeps the background sync setup safe to run after a rotation", () => {
    expect(schedule).toContain("vault.update_secret");
    expect(schedule).toContain("soma-sync-every-five-minutes");
    expect(schedule).toContain("vault.decrypted_secrets");
  });
});
