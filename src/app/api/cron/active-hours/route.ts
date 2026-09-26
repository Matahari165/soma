import { NextResponse } from "next/server";

import {
  GOOGLE_HEALTH_ACTIVE_HOURS_MARKER,
  isGoogleHealthActiveHoursSyncDue,
  syncGoogleHealthActiveHoursConnection,
} from "@/integrations/google-health/active-hours";
import { requireServerEnv } from "@/lib/env";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

export const maxDuration = 50;

const ROUTE_DEADLINE_MS = 48_000;
const COLLECTION_RESERVE_MS = 22_000;
const CONNECTION_QUERY_LIMIT = 500;

type TimeoutQuery = {
  withTimeout?: (timeoutMs: number) => unknown;
  abortSignal?: (signal: AbortSignal) => unknown;
};

function withDeadline<T>(query: T, deadlineAt: number): T {
  const timeoutMs = Math.min(10_000, deadlineAt - Date.now() - 500);
  if (timeoutMs < 500) throw new Error("Active-hours route budget was reached.");
  const timeoutQuery = query as TimeoutQuery;
  if (typeof timeoutQuery.withTimeout === "function") return timeoutQuery.withTimeout(timeoutMs) as T;
  if (typeof timeoutQuery.abortSignal === "function") return timeoutQuery.abortSignal(AbortSignal.timeout(timeoutMs)) as T;
  return query;
}

function authorized(request: Request) {
  return request.headers.get("authorization") === `Bearer ${requireServerEnv("CRON_SECRET")}`;
}

function metadataObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const routeStartedAt = Date.now();
  const deadlineAt = routeStartedAt + ROUTE_DEADLINE_MS;
  const collectionDeadlineAt = deadlineAt - COLLECTION_RESERVE_MS;
  const admin = createCloudflareAdminClient();
  let connections: Array<{ id: string; metadata: unknown }> | null = null;
  let error: unknown = null;
  try {
    const query = withDeadline(admin.from("provider_connections")
      .select("id,metadata")
      .eq("provider", "google_health")
      .eq("status", "connected"), deadlineAt).limit(CONNECTION_QUERY_LIMIT);
    const result = await query;
    connections = result.data as Array<{ id: string; metadata: unknown }> | null;
    error = result.error;
  } catch (caught) {
    if (caught instanceof Error && caught.message === "Active-hours route budget was reached.") {
      return NextResponse.json({ processed: true, deferred: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    error = caught;
  }
  if (error) {
    console.error("[google-health-active-hours] connection lookup failed");
    return NextResponse.json({ error: "Google Health active-hours worker unavailable." }, { status: 503 });
  }

  const now = new Date();
  let failed = false;
  let deferred = false;

  for (const connection of connections ?? []) {
    if (!isGoogleHealthActiveHoursSyncDue(now, metadataObject(connection.metadata)[GOOGLE_HEALTH_ACTIVE_HOURS_MARKER])) continue;
    if (Date.now() >= collectionDeadlineAt - 1_000) {
      deferred = true;
      break;
    }
    try {
      const result = await syncGoogleHealthActiveHoursConnection(connection.id, { now, collectionDeadlineAt, deadlineAt });
      if (result.status === "locked") deferred = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Health analysis is already in progress.") {
        deferred = true;
        continue;
      }
      if (message === "Google Health active-hours collection budget was reached."
        || message === "Google Health active-hours worker budget was reached before analysis.") {
        deferred = true;
        break;
      }
      failed = true;
      console.error("[google-health-active-hours] collection failed", {
        reason: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  if (failed) return NextResponse.json({ error: "Google Health active-hours collection will retry." }, { status: 503 });
  return NextResponse.json(deferred ? { processed: true, deferred: true } : { processed: true }, { headers: { "Cache-Control": "private, no-store" } });
}
