import { NextRequest, NextResponse } from "next/server";

import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

function parsePeriod(value: string | null): AnalysisPeriod | null {
  if (value === "all") return "all";
  const numeric = Number(value);
  return numeric === 15 || numeric === 30 || numeric === 90 ? numeric : null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  if (period === null) return NextResponse.json({ error: "Invalid analysis period." }, { status: 400 });

  const snapshot = await getPersonalLabSnapshot(user, { periods: [period] });
  return NextResponse.json({ rows: snapshot.matrix.rows });
}
