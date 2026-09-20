import { NextRequest, NextResponse } from "next/server";

import { isPersonalLabPublishedRelation, selectMeaningfulRelations, type AnalysisPeriod } from "@/domain/lab/matrix";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getPersonalLabSnapshot } from "@/services/personal-lab";
const noStore = { "Cache-Control": "private, no-store" };

function parsePeriod(value: string | null): AnalysisPeriod | null {
  if (value === "all") return "all";
  const numeric = Number(value);
  return numeric === 15 || numeric === 30 || numeric === 90 ? numeric : null;
}

export async function GET(request: NextRequest) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  if (period === null) return NextResponse.json({ error: "Invalid analysis period." }, { status: 400, headers: noStore });

  try {
    const snapshot = await getPersonalLabSnapshot(user, { periods: [period] });
    const meaningfulRelationsWithoutStability = selectMeaningfulRelations(
      snapshot.matrix.rows.flatMap((row) => row.relations),
      40,
      { requireTemporalStability: false },
    );
    const publishedRelationIDs = snapshot.matrix.rows.flatMap((row) => row.relations)
      .filter(isPersonalLabPublishedRelation)
      .map((relation) => `${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}:${relation.period}`);
    return NextResponse.json({ period, ...snapshot.matrix, meaningfulRelationsWithoutStability, publishedRelationIDs }, {
      headers: noStore,
    });
  } catch {
    return NextResponse.json({ error: "The Personal Lab matrix could not be loaded." }, { status: 500, headers: noStore });
  }
}
