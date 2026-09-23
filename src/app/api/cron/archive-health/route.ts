import { NextResponse } from "next/server";

import { archiveNextEligibleHeartRateDay } from "@/services/health-archive";
import { requireServerEnv } from "@/lib/env";

export const maxDuration = 50;

function authorized(request: Request) {
  return request.headers.get("authorization") === `Bearer ${requireServerEnv("CRON_SECRET")}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const archived = [];
    // Do not start another day late in the request: a dense day can take tens of seconds.
    const deadline = Date.now() + 15_000;
    for (let index = 0; index < 4 && Date.now() < deadline; index += 1) {
      const result = await archiveNextEligibleHeartRateDay();
      if (!result) break;
      archived.push(result);
    }
    return NextResponse.json({ archived });
  } catch (error) {
    console.error("[api/cron/archive-health] archive failed", { reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Health records could not be archived." }, { status: 500 });
  }
}
