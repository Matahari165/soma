import { NextResponse } from "next/server";

import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

function parsePeriod(value: string | null): AnalysisPeriod {
  return value === "15" ? 15 : value === "30" ? 30 : value === "all" ? "all" : 90;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const url = new URL(request.url);
    const snapshot = await getPersonalLabSnapshot(user, { periods: [parsePeriod(url.searchParams.get("period"))] });
    return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your Personal Lab is temporarily unavailable." }, { status: 503 });
  }
}
