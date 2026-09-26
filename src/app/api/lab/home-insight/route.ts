import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { assistantDatabaseRequest, assistantFilter } from "@/modules/assistant/repository/database";
import { getPersonalLabActivitySummaries } from "@/services/health-analytics";
import { createPersonalLabStream } from "@/services/personal-lab";

export const runtime = "nodejs";
export const maxDuration = 30;

const cacheFormat = "v3\n";
const maxInsightLength = 220;

const headers = { "Cache-Control": "private, no-store" };

type Claim = { claimed: boolean; text?: string | null; generatedAt?: string | null; pending?: boolean; limitReached?: boolean };
type CachedInsight = { source_hash: string; status: "pending" | "ready" | "failed"; insight_text: string | null; generated_at: string | null; generation_count: number };

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

function durationDifference(value: number) {
  const minutes = Math.round(Math.abs(value));
  return minutes < 60 ? `${minutes} min` : duration(minutes);
}

function dateBefore(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function activityPaceComparison(summaries: Array<{ date: string; activity: { type: string; averagePaceSecondsPerKm: number | null } }>, day: string, activity: { type: string; averagePaceSecondsPerKm: number | null } | null) {
  const currentPace = measured(activity?.averagePaceSecondsPerKm);
  if (!activity || currentPace === null || currentPace <= 0) return null;
  const firstDate = dateBefore(day, 7);
  const comparable = summaries
    .filter((summary) => summary.date >= firstDate && summary.date < day && summary.activity.type.toUpperCase() === activity.type.toUpperCase())
    .map((summary) => measured(summary.activity.averagePaceSecondsPerKm))
    .filter((value): value is number => value !== null && value > 0);
  if (comparable.length < 3) return null;
  const mean = comparable.reduce((sum, value) => sum + value, 0) / comparable.length;
  return { differenceSecondsPerKm: Math.round(currentPace - mean), samples: comparable.length };
}

function fallback(evidence: {
  moment: string;
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  effortCoverage: number | null;
  sleepBaseline: Baseline;
  recoveryBaseline: Baseline;
  activity: { count: number; paceComparison: { differenceSecondsPerKm: number; samples: number } | null } | null;
}) {
  const lines: string[] = [];
  if (evidence.activity) {
    const comparison = evidence.activity.paceComparison;
    const activityFacts: string[] = [];
    if (comparison) {
      const delta = comparison.differenceSecondsPerKm;
      const pace = delta === 0
        ? "identique à celle de " + comparison.samples + " sorties comparables"
        : Math.abs(delta) + " s/km " + (delta < 0 ? "plus rapide" : "plus lente") + " que la moyenne de " + comparison.samples + " sorties comparables";
      activityFacts.push("Allure moyenne " + pace + " des 7 derniers jours");
    }
    if (evidence.activity.count > 1) activityFacts.unshift(evidence.activity.count + " activités enregistrées aujourd’hui");
    if (activityFacts.length) lines.push(activityFacts.join(" ; ") + ".");
  }
  const sleepDifference = evidence.sleepMinutes !== null && evidence.sleepBaseline ? Math.round(evidence.sleepMinutes - evidence.sleepBaseline.mean) : null;
  const sleepComparison = evidence.sleepBaseline && sleepDifference !== null
    ? sleepDifference === 0
      ? `, comme votre moyenne récente (${evidence.sleepBaseline.samples} nuits)`
      : `, ${durationDifference(sleepDifference)} de ${sleepDifference > 0 ? "plus" : "moins"} que votre moyenne récente (${evidence.sleepBaseline.samples} nuits)`
    : "";
  const sleep = evidence.sleepMinutes === null ? null : `Cette nuit : ${duration(evidence.sleepMinutes)}${sleepComparison}.`;
  const recoveryDifference = evidence.recoveryScore !== null && evidence.recoveryBaseline ? Math.round(evidence.recoveryScore - evidence.recoveryBaseline.mean) : null;
  const recoveryComparison = evidence.recoveryBaseline && recoveryDifference !== null
    ? recoveryDifference === 0
      ? `, comme votre moyenne récente (${evidence.recoveryBaseline.samples} jours)`
      : `, ${Math.abs(recoveryDifference)} points ${recoveryDifference > 0 ? "au-dessus" : "sous"} de votre moyenne récente (${evidence.recoveryBaseline.samples} jours)`
    : " aujourd’hui";
  const recovery = evidence.recoveryScore === null ? null : `Récupération Soma : ${Math.round(evidence.recoveryScore)}/100${recoveryComparison}.`;
  const effort = evidence.effortScore === null ? null : `Effort Soma : ${evidence.effortScore.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/100 aujourd’hui${evidence.effortCoverage !== null && evidence.effortCoverage < 1 ? ", données partielles" : ""}.`;
  for (const line of evidence.moment === "evening" ? [effort, sleep, recovery] : [sleep, recovery, effort]) {
    if (line && lines.length < 2 && [...lines, line].join("\n").length <= maxInsightLength) lines.push(line);
  }
  return lines.join("\n") || (evidence.activity
    ? "Une activité a été enregistrée aujourd’hui."
    : "Aucune mesure disponible aujourd’hui.");
}

function responseText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text;
  return response.output?.flatMap((part) => part.content ?? []).filter((part) => part.type === "output_text" && typeof part.text === "string").map((part) => part.text as string).join("") || null;
}

function validInsightText(text: string, evidence: { sleepMinutes: number | null }) {
  if (text.length > maxInsightLength || (text.match(/[.!?](?:\s|$)/g) ?? []).length > 2) return null;
  if (evidence.sleepMinutes !== null) {
    const sleepMinutes = Math.round(evidence.sleepMinutes);
    const rawSleepDuration = new RegExp(`\\b${sleepMinutes}[\\s\\u00a0]*(?:min(?:ute)?s?)\\b`, "i");
    if (rawSleepDuration.test(text)) return null;
  }
  return text;
}

function validInsight(value: unknown, evidence: { sleepMinutes: number | null }) {
  if (!value || typeof value !== "object") return null;
  const lines = (value as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 2 || lines.some((line) => typeof line !== "string" || line.trim().length < 8 || line.length > maxInsightLength)) return null;
  const text = lines.map((line: string) => line.trim()).join("\n");
  return validInsightText(text, evidence);
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
    const activitySummaries = await getPersonalLabActivitySummaries(user.id, dateBefore(day, 7), day);
    const activitySummary = activitySummaries.find((summary) => summary.date === day) ?? null;
    const hour = localHour(overview.timeZone);
    const slot = hour >= 18 ? "evening" : hour >= 6 && activitySummary ? "activity" : hour >= 6 && hour < 12 ? "morning" : "day";
    const modelEligible = hour >= 6 && (hour < 12 || Boolean(activitySummary) || hour >= 18);
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
        count: activitySummary.count,
        paceComparison: activityPaceComparison(activitySummaries, day, activitySummary.activity),
      } : null,
    };
    const sourceHash = createHash("sha256").update(JSON.stringify({ format: cacheFormat, evidence })).digest("hex");
    const source = [activitySummary ? "Activité" : null, evidence.sleepMinutes !== null ? "Sommeil" : null, evidence.recoveryScore !== null ? "Récupération" : null, evidence.effortScore !== null ? "Effort" : null].filter(Boolean).join(" · ") || "Observations du jour";
    const defaultText = fallback(evidence);
    const responseTime = new Date().toISOString();
    if (isLocalPreviewMode()) return NextResponse.json({ text: defaultText, source, moment: slot, generatedAt: responseTime, stale: false, preview: true }, { headers });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ text: defaultText, source, moment: slot, generatedAt: responseTime, stale: false }, { headers });
    const hasFacts = Boolean(activitySummary) || [evidence.sleepMinutes, evidence.recoveryScore, evidence.effortScore].some((value) => value !== null);
    if (!modelEligible || !hasFacts) return NextResponse.json({ text: defaultText, source, moment: slot, generatedAt: responseTime, stale: false, pending: false }, { headers });

    const cachePath = "home_soma_insights?select=source_hash,status,insight_text,generated_at,generation_count&user_id=eq." + assistantFilter(user.id) + "&local_date=eq." + day + "&slot=eq." + slot;
    let cached: CachedInsight | null;
    try {
      const rows = await assistantDatabaseRequest<CachedInsight[]>(cachePath);
      cached = rows[0] ?? null;
    } catch {
      return NextResponse.json({ text: defaultText, source, moment: slot, generatedAt: responseTime, stale: true, pending: false }, { headers });
    }
    const cacheMatches = cached?.source_hash === sourceHash;
    const cachedText = cached?.insight_text?.startsWith(cacheFormat) ? cached.insight_text.slice(cacheFormat.length) : null;
    const safeCachedText = cachedText ? validInsightText(cachedText, evidence) : null;
    if (cacheMatches && cached?.status === "ready" && safeCachedText) {
      return NextResponse.json({ text: safeCachedText, source, moment: slot, generatedAt: cached.generated_at ?? responseTime, stale: false, pending: false }, { headers });
    }
    if (cached && (cached.generation_count > 0 || cached.status === "pending" || cached.status === "failed")) {
      return NextResponse.json({ text: defaultText, source, moment: slot, generatedAt: responseTime, stale: !cacheMatches, pending: cached.status === "pending" }, { headers });
    }

    let claim: Claim;
    try {
      claim = await assistantDatabaseRequest<Claim>("rpc/claim_home_soma_insight", {
        method: "POST", body: { p_user_id: user.id, p_local_date: day, p_slot: slot, p_source_hash: sourceHash },
      });
    } catch {
      return NextResponse.json({ text: defaultText, source, moment: slot, generatedAt: responseTime, stale: true, pending: false }, { headers });
    }
    if (!claim.claimed) {
      let claimedInsight: CachedInsight | null = null;
      try {
        const rows = await assistantDatabaseRequest<CachedInsight[]>(cachePath);
        claimedInsight = rows[0] ?? null;
      } catch {
        // A current-data fallback is preferable to serving a cache whose source cannot be checked.
      }
      const cacheMatches = claimedInsight?.source_hash === sourceHash;
      const cachedText = claimedInsight?.insight_text?.startsWith(cacheFormat) ? claimedInsight.insight_text.slice(cacheFormat.length) : null;
      const safeCachedText = cachedText ? validInsightText(cachedText, evidence) : null;
      if (cacheMatches && claimedInsight?.status === "ready" && safeCachedText) {
        return NextResponse.json({
          text: safeCachedText, source, moment: slot, generatedAt: claimedInsight.generated_at ?? claim.generatedAt ?? responseTime,
          stale: false, pending: false, limitReached: Boolean(claim.limitReached),
        }, { headers });
      }
      return NextResponse.json({
        text: defaultText, source, moment: slot, generatedAt: responseTime,
        stale: !cacheMatches, pending: Boolean(claim.pending), limitReached: Boolean(claim.limitReached),
      }, { headers });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    let generated: string | null = null;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-6-luna", store: false, reasoning: { effort: "low" }, max_output_tokens: 280,
          instructions: "Écris une ou deux phrases concrètes et naturelles en français, 220 caractères au total maximum. Priorité à une comparaison d’allure fournie, puis au sommeil et à la récupération; le soir, situe aussi l’effort accumulé. Exprime le sommeil en heures et minutes (ex. 8 h 05), jamais en minutes brutes. Le bloc Activité voisin affiche déjà le type, la durée, la distance et les mesures cardiaques : ne les répète pas. Pour l’activité, cite le nombre de séances et compare l’allure seulement si paceComparison la compare à au moins trois séances récentes du même type; differenceSecondsPerKm est l’écart à leur moyenne, négatif signifie plus rapide. Compare aux baselines fournis avec un écart simple; ne répète pas leur valeur et indique le nombre d’échantillons seulement si cela reste concis. Identifie les scores récupération et effort comme calculés par Soma sur 100. effortCoverage inférieure à 1 signifie données partielles. Utilise uniquement les valeurs fournies. null signifie donnée absente, jamais zéro. Sans baseline, ne prétends aucune évolution ou performance. Pas de salutation, formule vague, renvoi vers les pages, injonction, diagnostic, causalité ou promesse.",
          input: JSON.stringify(evidence),
          text: { format: { type: "json_schema", name: "home_insight", strict: true, schema: { type: "object", properties: { lines: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } } }, required: ["lines"], additionalProperties: false } } },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.ok) {
        const raw = responseText(await response.json().catch(() => null));
        generated = raw ? validInsight(JSON.parse(raw), evidence) : null;
      }
    } catch {
      // A deterministic, data-aware sentence remains available when generation fails.
    } finally {
      clearTimeout(timeout);
    }
    const text = generated || defaultText;
    const generatedAt = new Date().toISOString();
    await assistantDatabaseRequest(`home_soma_insights?user_id=eq.${assistantFilter(user.id)}&local_date=eq.${day}&slot=eq.${slot}&source_hash=eq.${sourceHash}`, {
      method: "PATCH", body: { insight_text: cacheFormat + text, status: generated ? "ready" : "failed", generated_at: generatedAt },
    });
    return NextResponse.json({ text, source, moment: slot, generatedAt, stale: false, pending: false }, { headers });
  } catch {
    return NextResponse.json({ text: "Le résumé du jour est indisponible pour le moment. Vous pouvez quand même poser votre question à Soma.", source: "Résumé indisponible", moment: "day", unavailable: true }, { headers });
  }
}
