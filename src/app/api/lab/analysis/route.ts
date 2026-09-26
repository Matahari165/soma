import { NextResponse } from "next/server";

import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { elapsedServerMs, serverNow, withServerTiming } from "@/lib/performance";
import { getPersonalLabSnapshotWithTimings } from "@/services/personal-lab";

// Leave time for after-response cache/history writes within the invocation.
export const maxDuration = 50;

function parsePeriod(value: string | null): AnalysisPeriod {
  return value === "15" ? 15 : value === "30" ? 30 : value === "all" ? "all" : 90;
}

export async function GET(request: Request) {
  const startedAt = serverNow();
  const authStartedAt = serverNow();
  const user = await getCurrentUser();
  const authMs = elapsedServerMs(authStartedAt);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const url = new URL(request.url);
    const { snapshot, timings } = await getPersonalLabSnapshotWithTimings(user, { periods: [parsePeriod(url.searchParams.get("period"))] });
    const response = NextResponse.json({ snapshot }, { headers: { "Cache-Control": "private, no-store" } });
    withServerTiming(response, [
      { name: "auth", durationMs: authMs },
      { name: "cache", durationMs: timings.cacheMs },
      { name: "data", durationMs: timings.dataMs },
      { name: "build", durationMs: timings.buildMs },
      { name: "total", durationMs: elapsedServerMs(startedAt) },
    ]);
    response.headers.append("Server-Timing", `cache_state;desc="${timings.cacheStatus}"`);
    response.headers.append("Server-Timing", 'history;desc="deferred"');
    return response;
  } catch {
    return NextResponse.json({ error: "Your Personal Lab is temporarily unavailable." }, { status: 503 });
  }
}
