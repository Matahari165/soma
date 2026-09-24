import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { loadDailyLabRelationSnapshots } from "@/services/lab-relation-history";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 90);
  const limit = Number.isSafeInteger(requested) ? Math.max(1, Math.min(180, requested)) : 90;
  try {
    const snapshots = await loadDailyLabRelationSnapshots(user.id, limit);
    return NextResponse.json({ period: 90, snapshots }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Relation history is temporarily unavailable." }, { status: 503 });
  }
}
