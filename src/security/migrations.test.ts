import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/migrations/20260808000000_complete_product_schema.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../../supabase/migrations/20260808130000_production_hardening.sql", import.meta.url), "utf8");
const serviceRolePrivileges = readFileSync(new URL("../../supabase/migrations/20260808143000_restore_service_role_privileges.sql", import.meta.url), "utf8");
const atomicProfileUpdates = readFileSync(new URL("../../supabase/migrations/20260819211500_atomic_profile_updates.sql", import.meta.url), "utf8");
const atomicWorkoutAndCoachWrites = readFileSync(new URL("../../supabase/migrations/20260819213000_atomic_workout_and_coach_writes.sql", import.meta.url), "utf8");
const googleHealthReconciliation = readFileSync(new URL("../../supabase/migrations/20260820090000_google_health_reconciliation.sql", import.meta.url), "utf8");
const optimizedGoogleHealthReconciliation = readFileSync(new URL("../../supabase/migrations/20260823093000_optimize_google_health_reconciliation.sql", import.meta.url), "utf8");
const dailyGoogleHealthSync = readFileSync(new URL("../../supabase/migrations/20260820110000_daily_google_health_sync.sql", import.meta.url), "utf8");
const personalLab = readFileSync(new URL("../../supabase/migrations/20260822120000_personal_lab.sql", import.meta.url), "utf8");
const journalAndHourlySync = readFileSync(new URL("../../supabase/migrations/20260822160000_journal_and_hourly_sync.sql", import.meta.url), "utf8");
const healthRecordArchives = readFileSync(new URL("../../supabase/migrations/20260824090000_lossless_health_record_archives.sql", import.meta.url), "utf8");
const cloudflareR2Archives = readFileSync(new URL("../../supabase/migrations/20260824120000_cloudflare_r2_archives.sql", import.meta.url), "utf8");
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

  it("keeps Calendar content aggregated and daily context owner-scoped", () => {
    expect(personalLab).toContain("alter table public.daily_calendar_metrics enable row level security;");
    expect(personalLab).toContain("alter table public.daily_checkins enable row level security;");
    expect(personalLab).toMatch(/create policy daily_calendar_metrics_read_own[\s\S]*for select to authenticated/i);
    expect(personalLab).toMatch(/create policy daily_checkins_owner[\s\S]*for all to authenticated/i);
    expect(personalLab).not.toMatch(/grant (insert|update|delete)[^;]*daily_calendar_metrics[^;]*to authenticated/i);
  });

  it("explicitly denies application roles access to service-only resources", () => {
    for (const policy of ["provider_connections_server_only", "webhook_events_server_only", "agent_action_proposals_server_only"]) {
      expect(hardening).toContain(`create policy ${policy}`);
    }
    expect(hardening).toMatch(/revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated/i);
  });

  it("keeps server-only resources usable by the backend service role", () => {
    expect(serviceRolePrivileges).toMatch(/grant select, insert, update, delete on all tables in schema public to service_role/i);
    expect(serviceRolePrivileges).toMatch(/alter default privileges for role postgres in schema public/i);
    expect(serviceRolePrivileges).not.toMatch(/to (anon|authenticated)/i);
  });

  it("keeps the background sync setup safe to run after a rotation", () => {
    expect(schedule).toContain("vault.update_secret");
    expect(schedule).toContain("cron.unschedule");
    expect(schedule).toContain("soma-sync-worker");
    expect(schedule).toContain("'*/5 * * * *'");
    expect(schedule).toContain("vault.decrypted_secrets");
    expect(dailyGoogleHealthSync).toContain("sync_jobs_one_automatic_per_day_idx");
    expect(dailyGoogleHealthSync).toMatch(/where sync_trigger = 'automatic'/i);
    expect(journalAndHourlySync).toContain("sync_jobs_one_automatic_per_slot_idx");
    expect(journalAndHourlySync).toContain("scheduled_sync_slot");
  });

  it("keeps journal values owner-scoped and tied to the owner's variables", () => {
    expect(journalAndHourlySync).toContain("alter table public.journal_variables enable row level security;");
    expect(journalAndHourlySync).toContain("alter table public.journal_entries enable row level security;");
    expect(journalAndHourlySync).toMatch(/foreign key \(user_id, variable_id\) references public\.journal_variables\(user_id, id\)/i);
    expect(journalAndHourlySync).toMatch(/create policy journal_entries_owner[\s\S]*for all to authenticated/i);
  });

  it("updates profile settings and onboarding atomically through service-only functions", () => {
    for (const functionName of ["update_soma_profile", "complete_soma_onboarding"]) {
      expect(atomicProfileUpdates).toMatch(new RegExp(`create or replace function public\\.${functionName}`, "i"));
      expect(atomicProfileUpdates).toMatch(new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated`, "i"));
      expect(atomicProfileUpdates).toMatch(new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to service_role`, "i"));
    }
    expect(atomicProfileUpdates).toContain("update public.profiles");
    expect(atomicProfileUpdates).toContain("update public.sleep_preferences");
    expect(atomicProfileUpdates).toContain("insert into public.health_goals");
  });

  it("keeps workout and confirmed Coach multi-table writes atomic and service-only", () => {
    for (const functionName of ["create_soma_workout_program", "start_soma_workout_session", "execute_soma_proposal", "persist_soma_coach_exchange"]) {
      expect(atomicWorkoutAndCoachWrites).toMatch(new RegExp(`create or replace function public\\.${functionName}`, "i"));
      expect(atomicWorkoutAndCoachWrites).toMatch(new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated`, "i"));
      expect(atomicWorkoutAndCoachWrites).toMatch(new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to service_role`, "i"));
    }
    expect(atomicWorkoutAndCoachWrites).toContain("extensions.digest(");
  });

  it("keeps Google Health reconciliation atomic and service-only", () => {
    expect(googleHealthReconciliation).toContain("reconciliation_token");
    expect(googleHealthReconciliation).toContain("google_health_reconciliation_stage");
    expect(googleHealthReconciliation).toMatch(/insert into public\.health_records[\s\S]*delete from public\.health_records/i);
    expect(googleHealthReconciliation).toMatch(/revoke all on table public\.google_health_reconciliation_stage from public, anon, authenticated/i);
    expect(googleHealthReconciliation).toMatch(/create or replace function public\.reconcile_google_health_window/i);
    expect(googleHealthReconciliation).toMatch(/revoke all on function public\.reconcile_google_health_window[\s\S]*from public, anon, authenticated/i);
    expect(googleHealthReconciliation).toMatch(/grant execute on function public\.reconcile_google_health_window[\s\S]*to service_role/i);
    expect(optimizedGoogleHealthReconciliation).toContain("google_health_reconciliation_stage_record_lookup_idx");
    expect(optimizedGoogleHealthReconciliation).toMatch(/if p_date_based then[\s\S]*else[\s\S]*end if/i);
    expect(optimizedGoogleHealthReconciliation).toMatch(/revoke all on function public\.reconcile_google_health_window[\s\S]*from public, anon, authenticated/i);
    expect(optimizedGoogleHealthReconciliation).toMatch(/grant execute on function public\.reconcile_google_health_window[\s\S]*to service_role/i);
  });

  it("keeps lossless health archives private and reclaims rows only after verification", () => {
    expect(healthRecordArchives).toContain("alter table public.health_record_archives enable row level security;");
    expect(healthRecordArchives).toMatch(/create policy health_record_archives_read_own[\s\S]*auth\.uid\(\) = user_id/i);
    expect(healthRecordArchives).toMatch(/'health-record-archives'[\s\S]*false/i);
    expect(healthRecordArchives).toMatch(/if v_archive\.verified_at is null[\s\S]*raise exception/i);
    expect(healthRecordArchives).toMatch(/if v_live_count <> v_archive\.row_count[\s\S]*raise exception/i);
    expect(healthRecordArchives).toMatch(/revoke all on function public\.reclaim_verified_health_archive\(uuid\) from public, anon, authenticated/i);
    expect(healthRecordArchives).toMatch(/grant execute on function public\.reclaim_verified_health_archive\(uuid\) to service_role/i);
  });

  it("tracks private health archives moved from Supabase Storage to R2", () => {
    expect(cloudflareR2Archives).toMatch(/storage_backend text not null default 'supabase'/i);
    expect(cloudflareR2Archives).toMatch(/storage_backend in \('supabase', 'r2'\)/i);
    expect(cloudflareR2Archives).toContain("health_record_archives_storage_backend_idx");
  });
});
