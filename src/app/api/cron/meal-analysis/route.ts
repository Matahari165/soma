import { NextResponse } from "next/server";

import { requireServerEnv } from "@/lib/env";
import { processNextMealAnalysis } from "@/services/meals";

/** Keep enough headroom below Vercel's non-fluid Hobby maximum of 60 seconds. */
export const maxDuration = 50;

function isAuthorized(request: Request) {
  const secret = requireServerEnv("CRON_SECRET");
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await processNextMealAnalysis();
    return NextResponse.json({ processed: result.processed, status: result.analysis?.status ?? "idle" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[meal-analysis] worker invocation failed", { stage: "worker_invocation", reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Meal analysis worker unavailable." }, { status: 503 });
  }
}
