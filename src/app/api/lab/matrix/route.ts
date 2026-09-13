import { NextRequest, NextResponse } from "next/server";

import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { elapsedServerMs, serverNow, withServerTiming } from "@/lib/performance";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

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

  const loaderStartedAt = serverNow();
  const snapshot = await getPersonalLabSnapshot(user, { periods: [period] });
  const loaderMs = elapsedServerMs(loaderStartedAt);
  const renderStartedAt = serverNow();
  const response = NextResponse.json({ rows: snapshot.matrix.rows, outcomes: snapshot.matrix.outcomes, periods: snapshot.matrix.periods }, {
    headers: { "Cache-Control": "private, no-store" },
  });
  const renderMs = elapsedServerMs(renderStartedAt);
  return withServerTiming(response, [
    { name: "auth", durationMs: authMs },
    { name: "loader", durationMs: loaderMs },
    { name: "render", durationMs: renderMs },
    { name: "total", durationMs: elapsedServerMs(startedAt) },
  ]);
}
