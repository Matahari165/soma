import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { assistantDatabaseRequest, assistantFilter } from "@/modules/assistant/repository/database";
import { getPersonalLabActivitySummaries } from "@/services/health-analytics";
import { createPersonalLabStream } from "@/services/personal-lab";

export const runtime = "nodejs";
export const maxDuration = 30;

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

function fallback(evidence: {
  moment: string;
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  activity: { type: string; durationMinutes: number | null; distanceKm: number | null } | null;
}) {
  if (evidence.activity) {
    const type = evidence.activity.type.toUpperCase();
    const label = type.includes("RUN") || type.includes("JOG") ? "Course à pied" : type.includes("CYCL") || type.includes("BIK") ? "Vélo" : type.includes("WALK") ? "Marche" : "Activité";
    const details = [
      evidence.activity.durationMinutes === null ? null : `${Math.round(evidence.activity.durationMinutes)} min`,
      evidence.activity.distanceKm === null ? null : `${evidence.activity.distanceKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`,
    ].filter(Boolean);
    return `${label} enregistrée aujourd’hui${details.length ? ` · ${details.join(" · ")}` : ""}.`;
  }
  if (evidence.moment === "morning" && evidence.sleepMinutes !== null) {
    const hours = Math.floor(evidence.sleepMinutes / 60);
    const minutes = Math.round(evidence.sleepMinutes % 60);
    return `Cette nuit : ${hours} h ${String(minutes).padStart(2, "0")} de sommeil${evidence.recoveryScore === null ? "." : ` · récupération ${Math.round(evidence.recoveryScore)}.`}`;
  }
  if (evidence.moment === "evening" && evidence.effortScore !== null) return `Effort du jour : ${evidence.effortScore.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}. Les autres observations restent accessibles dans Soma.`;
  if (evidence.recoveryScore !== null) return `Récupération du jour : ${Math.round(evidence.recoveryScore)}. Vous pouvez demander à Soma de la mettre en contexte.`;
  return "Aucune nouvelle observation à résumer pour le moment. Soma reste disponible pour vos questions.";
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
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 2 || lines.some((line) => typeof line !== "string" || line.trim().length < 8 || line.length > 150)) return null;
  return lines.map((line: string) => line.trim()).join("\n");
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
    const [activitySummary] = await getPersonalLabActivitySummaries(user.id, day, day).catch(() => []);
    const hour = localHour(overview.timeZone);
    const slot = activitySummary ? "activity" : hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
    const evidence = {
      localDate: day,
      moment: slot,
      sleepMinutes: measured(overview.today.sleepMinutes),
      sleepRegularity: measured(overview.today.sleepRegularity),
      recoveryScore: measured(overview.today.recoveryScore),
      effortScore: measured(overview.today.effortScore),
      energy: measured(overview.today.energy),
      activity: activitySummary ? {
        type: activitySummary.activity.type,
        count: activitySummary.count,
        durationMinutes: measured(activitySummary.activity.durationMinutes),
        distanceKm: measured(activitySummary.activity.distanceKm),
      } : null,
    };
    const sourceHash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    const source = [activitySummary ? "Activité" : null, evidence.sleepMinutes !== null ? "Sommeil" : null, evidence.recoveryScore !== null ? "Récupération" : null, evidence.effortScore !== null ? "Effort" : null].filter(Boolean).join(" · ") || "Observations du jour";
    const defaultText = fallback(evidence);
    if (isLocalPreviewMode()) return NextResponse.json({ text: defaultText, source, moment: slot, preview: true }, { headers });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ text: defaultText, source, moment: slot }, { headers });

    const claim = await assistantDatabaseRequest<Claim>("rpc/claim_home_soma_insight", {
      method: "POST", body: { p_user_id: user.id, p_local_date: day, p_slot: slot, p_source_hash: sourceHash },
    });
    if (!claim.claimed) return NextResponse.json({ text: claim.text || defaultText, source, moment: slot, generatedAt: claim.generatedAt ?? null, pending: Boolean(claim.pending) }, { headers });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    let generated: string | null = null;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-6-luna", store: false, reasoning: { effort: "low" }, max_output_tokens: 190,
          instructions: "Tu rédiges un aperçu personnel très bref en français pour l'accueil de Soma. Une ou deux observations utiles, sans salutation, injonction, diagnostic, causalité ou promesse. Utilise uniquement les valeurs fournies; null signifie donnée absente et n'est jamais zéro. L'activité enregistrée est prioritaire. Ne déduis aucune performance ou évolution sans comparaison explicite. Évite les phrases génériques si une mesure est disponible.",
          input: JSON.stringify(evidence),
          text: { format: { type: "json_schema", name: "home_insight", strict: true, schema: { type: "object", properties: { lines: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } } }, required: ["lines"], additionalProperties: false } } },
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
      method: "PATCH", body: { insight_text: text, status: generated ? "ready" : "failed", generated_at: new Date().toISOString() },
    });
    return NextResponse.json({ text, source, moment: slot, generatedAt: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ text: "Vos observations récentes sont disponibles. Vous pouvez poser une question à Soma.", source: "Observations du jour", moment: "day", unavailable: true }, { headers });
  }
}
