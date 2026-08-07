import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/migrations/20260808000000_complete_product_schema.sql", import.meta.url), "utf8");

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
});
