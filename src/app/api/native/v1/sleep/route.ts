import { NextResponse } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getSleepAnalyticsForUser } from "@/services/health-analytics";

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const analytics = await getSleepAnalyticsForUser(user);
    return NextResponse.json({
      timezone: analytics.timezone,
      importedAt: analytics.importedAt,
      days: analytics.days,
      scores: analytics.scores,
      sleepRecommendation: analytics.sleepRecommendation,
      latestSleepStages: analytics.latestSleepStages,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Sleep data could not be loaded." }, { status: 500 });
  }
}
