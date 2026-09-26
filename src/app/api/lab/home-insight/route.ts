import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { assistantDatabaseRequest, assistantFilter } from "@/modules/assistant/repository/database";
import { getPersonalLabActivitySummaries } from "@/services/health-analytics";
import { createPersonalLabStream } from "@/services/personal-lab";

export const runtime = "nodejs";
export const maxDuration = 30;

const cacheFormat = "v2\n";
const maxInsightLength = 350;

const headers = { "Cache-Control": "private, no-store" };

type Claim = { claimed: boolean; text?: string | null; generatedAt?: string | null; pending?: boolean; limitReached?: boolean };

function measured(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function localHour(timeZone: string) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  } catch {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  }
}

type Baseline = { mean: number; samples: number } | null;

function baseline(history: Array<{ date: string; sleepMinutes: number | null; recoveryScore: number | null }>, day: string, key: "sleepMinutes" | "recoveryScore"): Baseline {
  const start = new Date(`${day}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const firstDate = start.toISOString().slice(0, 10);
  const values = history.filter((point) => point.date >= firstDate && point.date < day).map((point) => measured(point[key])).filter((value): value is number => value !== null);
  return values.length >= 3 ? { mean: values.reduce((sum, value) => sum + value, 0) / values.length, samples: values.length } : null;
}

function duration(value: number) {
  const minutes = Math.round(value);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function fallback(evidence: {
  moment: string;
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  effortCoverage: number | null;
  sleepBaseline: Baseline;
  recoveryBaseline: Baseline;
  activity: { type: string; count: number; durationMinutes: number | null; distanceKm: number | null } | null;
}) {
  const lines: string[] = [];
  if (evidence.activity) {
    const type = evidence.activity.type.toUpperCase();
    const label = type.includes("RUN") || type.includes("JOG") ? "Course à pied" : type.includes("CYCL") || type.includes("BIK") ? "Vélo" : type.includes("WALK") ? "Marche" : "Activité";
    const details = [
      evidence.activity.durationMinutes === null ? null : `${Math.round(evidence.activity.durationMinutes)} min`,
      evidence.activity.distanceKm === null ? null : `${evidence.activity.distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`,
    ].filter(Boolean);
    lines.push(`${label} aujourd’hui${details.length ? ` : ${details.join(" · ")}` : " enregistrée"}.${evidence.activity.count > 1 ? ` ${evidence.activity.count} activités enregistrées au total.` : ""}`);
  }
  const sleep = evidence.sleepMinutes === null ? null : `Cette nuit : ${duration(evidence.sleepMinutes)} de sommeil${evidence.sleepBaseline ? `, contre ${duration(evidence.sleepBaseline.mean)} sur ${evidence.sleepBaseline.samples} nuits précédentes` : ""}.`;
  const recovery = evidence.recoveryScore === null ? null : `Récupération Soma : ${Math.round(evidence.recoveryScore)}/100${evidence.recoveryBaseline ? `, contre ${Math.round(evidence.recoveryBaseline.mean)}/100 en moyenne sur ${evidence.recoveryBaseline.samples} jours précédents` : " aujourd’hui"}.`;
  const effort = evidence.effortScore === null ? null : `Effort Soma accumulé aujourd’hui : ${evidence.effortScore.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/100.${evidence.effortCoverage !== null && evidence.effortCoverage < 1 ? " Données d’activité partielles." : ""}`;
  for (const line of evidence.moment === "evening" ? [effort, sleep, recovery] : [sleep, recovery, effort]) {
    if (line && lines.length < 3 && [...lines, line].join("\n").length <= maxInsightLength) lines.push(line);
  }
  return lines.join("\n") || "Aucune mesure de sommeil, de récupération ou d’activité disponible pour aujourd’hui. Vous pouvez poser votre question à Soma.";
}

function responseText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text;
  return response.output?.flatMap((part) => part.content ?? []).filter((part) => part.type === "output_text" && typeof part.text === "string").map((part) => part.text as string).join("") || null;
}

function validInsight(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const lines = (value as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 3 || lines.some((line) => typeof line !== "string" || line.trim().length < 8 || line.length > 180)) return null;
  const text = lines.map((line: string) => line.trim()).join("\n");
  return text.length <= maxInsightLength ? text : null;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let sameOrigin = true;
  try {
    sameOrigin = !origin || new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401, headers });

  try {
    const overview = await createPersonalLabStream(user, { includeAnalysis: false }).overview;
    const day = overview.todayDate;
    const [activitySummary] = await getPersonalLabActivitySummaries(user.id, day, day);
    const hour = localHour(overview.timeZone);
    const slot = hour >= 18 ? "evening" : activitySummary ? "activity" : hour < 12 ? "morning" : "day";
    const evidence = {
      localDate: day,
      moment: slot,
      sleepMinutes: measured(overview.today.sleepMinutes),
      recoveryScore: measured(overview.today.recoveryScore),
      effortScore: measured(overview.today.effortScore),
      effortCoverage: measured(overview.today.effortCoverage),
      sleepBaseline: baseline(overview.today.history ?? [], day, "sleepMinutes"),
      recoveryBaseline: baseline(overview.today.history ?? [], day, "recoveryScore"),
      activity: activitySummary ? {
        type: activitySummary.activity.type,
        count: activitySummary.count,
        durationMinutes: measured(activitySummary.activity.durationMinutes),
        distanceKm: measured(activitySummary.activity.distanceKm),
      } : null,
    };
    const sourceHash = createHash("sha256").update(JSON.stringify({ format: cacheFormat, evidence })).digest("hex");
    const source = [activitySummary ? "Activité" : null, evidence.sleepMinutes !== null ? "Sommeil" : null, evidence.recoveryScore !== null ? "Récupération" : null, evidence.effortScore !== null ? "Effort" : null].filter(Boolean).join(" · ") || "Observations du jour";
    const defaultText = fallback(evidence);
    if (isLocalPreviewMode()) return NextResponse.json({ text: defaultText, source, moment: slot, preview: true }, { headers });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ text: defaultText, source, moment: slot }, { headers });

    const claim = await assistantDatabaseRequest<Claim>("rpc/claim_home_soma_insight", {
      method: "POST", body: { p_user_id: user.id, p_local_date: day, p_slot: slot, p_source_hash: sourceHash },
    });
    if (!claim.claimed) return NextResponse.json({ text: claim.text?.startsWith(cacheFormat) ? claim.text.slice(cacheFormat.length) : defaultText, source, moment: slot, generatedAt: claim.generatedAt ?? null, pending: Boolean(claim.pending) }, { headers });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    let generated: string | null = null;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-6-luna", store: false, reasoning: { effort: "low" }, max_output_tokens: 280,
          instructions: "Écris 2 à 3 observations concrètes en français, une phrase par ligne, 350 caractères au total maximum. Si les données sont rares, une seule suffit. Priorité à l’activité récente, puis au sommeil et à la récupération; le soir, situe aussi l’effort accumulé. Chaque observation doit citer une mesure avec unité/échelle et son moment, puis une comparaison chiffrée si une baseline est fournie (moyenne des jours précédents, préciser samples). La durée/distance désigne l’activité représentative, jamais la somme des activités; count est leur nombre total. Les scores récupération et effort sont calculés par Soma sur 100, pas mesurés par un capteur. effortCoverage inférieure à 1 signifie données partielles. Utilise seulement les valeurs fournies. null signifie donnée absente, jamais zéro. Sans baseline, ne prétends aucune évolution ou performance. Pas de salutation, formule vague, renvoi vers les pages, injonction, diagnostic, causalité ou promesse.",
          input: JSON.stringify(evidence),
          text: { format: { type: "json_schema", name: "home_insight", strict: true, schema: { type: "object", properties: { lines: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } } }, required: ["lines"], additionalProperties: false } } },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.ok) {
        const raw = responseText(await response.json().catch(() => null));
        generated = raw ? validInsight(JSON.parse(raw)) : null;
      }
    } catch {
      // A deterministic, data-aware sentence remains available when generation fails.
    } finally {
      clearTimeout(timeout);
    }
    const text = generated || defaultText;
    await assistantDatabaseRequest(`home_soma_insights?user_id=eq.${assistantFilter(user.id)}&local_date=eq.${day}&slot=eq.${slot}&source_hash=eq.${sourceHash}`, {
      method: "PATCH", body: { insight_text: cacheFormat + text, status: generated ? "ready" : "failed", generated_at: new Date().toISOString() },
    });
    return NextResponse.json({ text, source, moment: slot, generatedAt: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ text: "Le résumé du jour est indisponible pour le moment. Vous pouvez quand même poser votre question à Soma.", source: "Résumé indisponible", moment: "day", unavailable: true }, { headers });
  }
}
