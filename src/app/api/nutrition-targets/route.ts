import { NextResponse } from "next/server";

import { parseNutritionTargets } from "@/domain/nutrition-targets";
import { getCurrentUser } from "@/lib/auth";
import { loadNutritionTargetsStateForUser, saveNutritionTargetsForUser } from "@/services/nutrition-targets";

const noStore = { "Cache-Control": "private, no-store" };

function logFailure(operation: "load" | "save") {
  // Keep production logs free of account identifiers and provider/database
  // payloads. The client still receives the stable, user-facing error below.
  console.error(`[api/nutrition-targets] ${operation} failed`);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    const state = await loadNutritionTargetsStateForUser(user.id);
    return NextResponse.json(state, { headers: noStore });
  } catch {
    logFailure("load");
    return NextResponse.json({ error: "Nutrition targets could not be loaded." }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as { targets?: unknown } | null;
  const targets = parseNutritionTargets(body?.targets ?? body);
  if (!targets) return NextResponse.json({ error: "Check every nutrition target and range." }, { status: 400, headers: noStore });
  try {
    const saved = await saveNutritionTargetsForUser(user.id, targets);
    return NextResponse.json({ targets: saved }, { headers: noStore });
  } catch {
    logFailure("save");
    return NextResponse.json({ error: "Nutrition targets could not be saved." }, { status: 500, headers: noStore });
  }
}
