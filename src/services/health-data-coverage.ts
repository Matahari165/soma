import "server-only";

import { calculateHealthDataCoverage, type ImportedHealthDate, type UsedHealthDate } from "@/domain/health/data-coverage";
import { GOOGLE_HEALTH_DASHBOARD_DATA_TYPES } from "@/integrations/google-health/client";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const PAGE_SIZE = 1_000;
const MAX_IMPORTED_ROWS = 50_000;
const MAX_METRIC_ROWS = 20_000;
type AdminClient = ReturnType<typeof createCloudflareAdminClient>;

async function loadImportedDates(admin: AdminClient, userId: string) {
  const rows: ImportedHealthDate[] = [];
  for (let from = 0; from < MAX_IMPORTED_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin.from("health_records")
      .select("provider,data_type,civil_date,start_time,end_time,measured_at,source_device,source_record_id,payload")
      .eq("user_id", userId)
      .in("data_type", [...GOOGLE_HEALTH_DASHBOARD_DATA_TYPES])
      .order("civil_date", { ascending: true, nullsFirst: false })
      .order("data_type", { ascending: true })
      .order("source_record_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Imported health coverage could not be loaded.");
    rows.push(...((data ?? []) as ImportedHealthDate[]));
    if (!data || data.length < PAGE_SIZE) return { rows, limited: false };
  }
  return { rows, limited: true };
}

async function loadUsedDates(admin: AdminClient, userId: string) {
  const rows: UsedHealthDate[] = [];
  for (let from = 0; from < MAX_METRIC_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin.from("daily_health_metrics")
      .select("metric_date,sleep_minutes")
      .eq("user_id", userId)
      .order("metric_date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Analyzed health coverage could not be loaded.");
    rows.push(...((data ?? []) as UsedHealthDate[]));
    if (!data || data.length < PAGE_SIZE) return { rows, limited: false };
  }
  return { rows, limited: true };
}

export async function getHealthDataCoverage(userId: string) {
  const admin = createCloudflareAdminClient();
  const [imported, used, profile] = await Promise.all([
    loadImportedDates(admin, userId),
    loadUsedDates(admin, userId),
    admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error) throw new Error("Health coverage timezone could not be loaded.");
  return calculateHealthDataCoverage({
    imported: imported.rows,
    used: used.rows,
    timeZone: profile.data?.timezone ?? "Europe/Paris",
    limited: imported.limited || used.limited,
  });
}
