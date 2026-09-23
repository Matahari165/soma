import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { findUserByAppleSyncToken, getOrCreateAppleSyncToken } from "@/lib/apple-health";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const appleHealthMetricItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepMinutes: z.number().nullable().optional(),
  deepSleepMinutes: z.number().nullable().optional(),
  remSleepMinutes: z.number().nullable().optional(),
  awakeMinutes: z.number().nullable().optional(),
  sleepLatencyMinutes: z.number().nullable().optional(),
  hrv: z.number().nullable().optional(),
  restingHeartRate: z.number().nullable().optional(),
  respiratoryRate: z.number().nullable().optional(),
  steps: z.number().nullable().optional(),
  activeCalories: z.number().nullable().optional(),
  oxygenSaturation: z.number().nullable().optional(),
  bedtime: z.string().nullable().optional(),
  wakeTime: z.string().nullable().optional(),
});

const appleSyncPayloadSchema = z.object({
  metrics: z.array(appleHealthMetricItemSchema).min(1).max(365),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = await getOrCreateAppleSyncToken(user.id);
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    ok: true,
    token,
    endpoint: `${origin}/api/health/apple-sync`,
  });
}

export async function POST(request: Request) {
  // 1. Identify user via Authorization Bearer token or session
  const authHeader = request.headers.get("authorization") || request.headers.get("x-sync-token") || "";
  let token = "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (authHeader.startsWith("soma_ah_")) {
    token = authHeader.trim();
  }

  let userId: string | null = null;
  if (token) {
    userId = await findUserByAppleSyncToken(token);
  }

  if (!userId) {
    const user = await getCurrentUser();
    if (user) userId = user.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid Bearer sync token in the Authorization header." },
      { status: 401 },
    );
  }

  // 2. Parse request payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  // Normalize: if sent as an array directly, wrap into { metrics: body }
  const rawData = Array.isArray(body) ? { metrics: body } : body;
  const parsed = appleSyncPayloadSchema.safeParse(rawData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid health metrics format.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createCloudflareAdminClient();
  const now = new Date().toISOString();

  // 3. Transform to daily_health_metrics records
  const metricRows = parsed.data.metrics.map((item) => ({
    user_id: userId,
    metric_date: item.date,
    sleep_minutes: item.sleepMinutes ?? null,
    sleep_deep_minutes: item.deepSleepMinutes ?? null,
    sleep_rem_minutes: item.remSleepMinutes ?? null,
    sleep_awake_minutes: item.awakeMinutes ?? null,
    sleep_latency_minutes: item.sleepLatencyMinutes ?? null,
    hrv_ms: item.hrv ?? null,
    resting_heart_rate: item.restingHeartRate ?? null,
    respiratory_rate: item.respiratoryRate ?? null,
    steps: item.steps ?? null,
    active_energy_kcal: item.activeCalories ?? null,
    oxygen_saturation: item.oxygenSaturation ?? null,
    bedtime: item.bedtime ?? null,
    wake_time: item.wakeTime ?? null,
    data_quality: { primaryWearable: "Apple Watch", source: "apple_health", importedAt: now },
    updated_at: now,
  }));

  const { error: upsertError } = await admin
    .from("daily_health_metrics")
    .upsert(metricRows, { onConflict: "user_id,metric_date" });

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to store health metrics: " + upsertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    importedDays: metricRows.length,
    lastSyncedAt: now,
  });
}
