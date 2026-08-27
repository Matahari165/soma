import { NextResponse } from "next/server";

import { generateLabNarrative } from "@/integrations/xai/lab";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { claimCloudflareLock, createCloudflareAdminClient, releaseCloudflareLock } from "@/lib/cloudflare/db";
import { getPersonalLabSnapshot } from "@/services/personal-lab";
import { shouldGenerateDailyNarrative } from "@/services/lab-narrative-policy";

export const maxDuration = 50;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createCloudflareAdminClient();
  const snapshot = await getPersonalLabSnapshot(user, { periods: [30, 90] });
  if (snapshot.aiNarrative?.isCurrent) return NextResponse.json({ ok: true, fresh: true });
  if (!shouldGenerateDailyNarrative({ isCurrent: false, needsRefresh: snapshot.needsNarrativeRefresh, candidateCount: snapshot.matrix.topRelations.length })) return NextResponse.json({ error: "Reliable overnight data is not available yet." }, { status: 409 });
  const lockKey = `lab-narrative:${user.id}:${snapshot.todayDate}`;
  const claimed = await claimCloudflareLock(lockKey, user.id, 90_000);
  if (!claimed) return NextResponse.json({ ok: true, generating: true }, { status: 202 });
  try {
    const { data: existingToday, error: existingError } = await admin.from("lab_narrative_history")
      .select("id,liked").eq("user_id", user.id).eq("analysis_date", snapshot.todayDate).maybeSingle();
    if (existingError) throw new Error("The current Personal Lab summary could not be checked.");
    const likedRelations = (snapshot.aiNarrative?.history ?? []).filter((item) => item.liked).flatMap((item) => item.sourceFacts.map((fact) => ({ predictor: fact.predictor, outcome: fact.outcome })));
    const previousRelations = (snapshot.aiNarrative?.history ?? []).flatMap((item) => item.sourceFacts.map((fact) => ({ predictor: fact.predictor, outcome: fact.outcome })));
    const { narrative, facts, usage } = await generateLabNarrative({ userId: user.id, relations: snapshot.matrix.topRelations, likedRelations, previousRelations });
    const selectedFacts = narrative.highlights.map((highlight) => facts[highlight.factIndex]).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
    const storedNarrative = { headline: narrative.headline, summary: narrative.summary, highlights: narrative.highlights.map((highlight, index) => ({ label: highlight.label, text: highlight.text, factIndex: index })) };
    const record = { id: existingToday?.id ?? crypto.randomUUID(), user_id: user.id, analysis_date: snapshot.todayDate, overnight_fingerprint: snapshot.overnightFingerprint, ...storedNarrative, source_facts: selectedFacts, evidence_candidates: facts, token_usage: usage, model: "grok-4.6", liked: existingToday?.liked ?? false, generated_at: new Date().toISOString() };
    const [{ error }, { error: currentError }] = await Promise.all([
      admin.from("lab_narrative_history").upsert(record, { onConflict: "user_id,analysis_date" }),
      admin.from("lab_narratives").upsert(record, { onConflict: "user_id" }),
    ]);
    if (error || currentError) throw new Error("The Personal Lab summary could not be stored.");
    return NextResponse.json({ ok: true, narrative: storedNarrative });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Grok analysis is temporarily unavailable." }, { status: 503 });
  } finally {
    await releaseCloudflareLock(lockKey, user.id).catch(() => undefined);
  }
}
