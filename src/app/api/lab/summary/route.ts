import { NextResponse } from "next/server";

import { generateLabNarrative } from "@/integrations/xai/lab";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

export const maxDuration = 50;

function dateInTimezone(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createSupabaseAdminClient();
  const [recentResult, profileResult] = await Promise.all([
    admin.from("lab_narrative_history").select("generated_at").eq("user_id", user.id).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
  ]);
  if (recentResult.error || profileResult.error) return NextResponse.json({ error: "The latest analysis could not be checked." }, { status: 500 });
  const timeZone = profileResult.data?.timezone ?? "Europe/Paris";
  if (recentResult.data && dateInTimezone(recentResult.data.generated_at, timeZone) === dateInTimezone(new Date(), timeZone)) return NextResponse.json({ ok: true, fresh: true });
  const snapshot = await getPersonalLabSnapshot(user);
  if (!snapshot.matrix.topRelations.length) return NextResponse.json({ error: "Not enough paired observations for synthesis." }, { status: 409 });
  try {
    const likedRelations = (snapshot.aiNarrative?.history ?? []).filter((item) => item.liked).flatMap((item) => item.sourceFacts.map((fact) => ({ predictor: fact.predictor, outcome: fact.outcome })));
    const previousRelations = (snapshot.aiNarrative?.history ?? []).flatMap((item) => item.sourceFacts.map((fact) => ({ predictor: fact.predictor, outcome: fact.outcome })));
    const { narrative, facts } = await generateLabNarrative({ userId: user.id, relations: snapshot.matrix.topRelations, likedRelations, previousRelations });
    const selectedFacts = narrative.highlights.map((highlight) => facts[highlight.factIndex]).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
    const storedNarrative = { ...narrative, highlights: narrative.highlights.map((highlight, index) => ({ text: highlight.text, factIndex: index })) };
    const record = { user_id: user.id, ...storedNarrative, source_facts: selectedFacts, model: "grok-4.6", generated_at: new Date().toISOString() };
    const [{ error }, { error: currentError }] = await Promise.all([
      admin.from("lab_narrative_history").insert(record),
      admin.from("lab_narratives").upsert(record),
    ]);
    if (error || currentError) throw new Error("The Personal Lab summary could not be stored.");
    return NextResponse.json({ ok: true, narrative: storedNarrative });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Grok analysis is temporarily unavailable." }, { status: 503 });
  }
}
