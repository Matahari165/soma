import { NextRequest, NextResponse } from "next/server";

import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { elapsedServerMs, serverNow, withServerTiming } from "@/lib/performance";
import { getPersonalLabMatrixWithTimings } from "@/services/personal-lab";

function parsePeriod(value: string | null): AnalysisPeriod | null {
  if (value === "all") return "all";
  const numeric = Number(value);
  return numeric === 15 || numeric === 30 || numeric === 90 ? numeric : null;
}

export async function GET(request: NextRequest) {
  const startedAt = serverNow();
  const authStartedAt = serverNow();
  const user = await getCurrentUser();
  const authMs = elapsedServerMs(authStartedAt);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  if (period === null) return NextResponse.json({ error: "Invalid analysis period." }, { status: 400 });

  const loaded = await getPersonalLabMatrixWithTimings(user, period);
  const renderStartedAt = serverNow();
  const response = NextResponse.json({ rows: loaded.matrix.rows, outcomes: loaded.matrix.outcomes, periods: loaded.matrix.periods }, {
    headers: { "Cache-Control": "private, no-store" },
  });
  const renderMs = elapsedServerMs(renderStartedAt);
  withServerTiming(response, [
    { name: "auth", durationMs: authMs },
    { name: "cache", durationMs: loaded.timings.cacheMs },
    { name: "data", durationMs: loaded.timings.dataMs },
    { name: "build", durationMs: loaded.timings.buildMs },
    { name: "render", durationMs: renderMs },
    { name: "total", durationMs: elapsedServerMs(startedAt) },
  ]);
  response.headers.append("Server-Timing", 'history;desc="deferred"');
  return response;
}
