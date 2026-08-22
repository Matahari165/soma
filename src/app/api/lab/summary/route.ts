import { NextResponse } from "next/server";

import { generateLabNarrative } from "@/integrations/xai/lab";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

export const maxDuration = 50;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createSupabaseAdminClient();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: recent, error: recentError } = await admin.from("lab_narratives").select("generated_at").eq("user_id", user.id).gte("generated_at", tenMinutesAgo).maybeSingle();
  if (recentError) return NextResponse.json({ error: "The latest analysis could not be checked." }, { status: 500 });
  if (recent) return NextResponse.json({ ok: true, fresh: true });
  const snapshot = await getPersonalLabSnapshot(user);
  if (!snapshot.matrix.topRelations.length) return NextResponse.json({ error: "Not enough paired observations for synthesis." }, { status: 409 });
  try {
    const { narrative, facts } = await generateLabNarrative({ userId: user.id, relations: snapshot.matrix.topRelations });
    const { error } = await admin.from("lab_narratives").upsert({ user_id: user.id, ...narrative, source_facts: facts, model: "grok-4.6", generated_at: new Date().toISOString() });
    if (error) throw new Error("The Personal Lab summary could not be stored.");
    return NextResponse.json({ ok: true, narrative });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Grok analysis is temporarily unavailable." }, { status: 503 });
  }
}
