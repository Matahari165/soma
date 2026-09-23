import { NextRequest, NextResponse } from "next/server";

import { selectSummaryRelations, type AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

type RankedEffect = { index: number; note: string };

function validPeriod(value: unknown): value is AnalysisPeriod {
  return value === 15 || value === 30 || value === 90 || value === "all";
}

function responseText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text as string).join("") || null;
}

function parseRanked(value: unknown, count: number): RankedEffect[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { ranked?: unknown }).ranked)) return null;
  const ranked = (value as { ranked: unknown[] }).ranked;
  if (!ranked.length || ranked.length > Math.min(3, count)) return null;
  const seen = new Set<number>();
  const safe: RankedEffect[] = [];
  for (const item of ranked) {
    if (!item || typeof item !== "object") return null;
    const { index, note } = item as { index?: unknown; note?: unknown };
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= count || seen.has(index as number) || typeof note !== "string" || note.length > 140) return null;
    seen.add(index as number);
    safe.push({ index: index as number, note: note.trim() });
  }
  return safe;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { period?: unknown; requireTemporalStability?: unknown } | null;
  if (!validPeriod(body?.period) || typeof body?.requireTemporalStability !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Summary unavailable." }, { status: 503 });

  const snapshot = await getPersonalLabSnapshot(user, { periods: [body.period] });
  const relations = selectSummaryRelations(snapshot.matrix.rows.flatMap((row) => row.relations), { requireTemporalStability: body.requireTemporalStability });
  if (!relations.length) return NextResponse.json({ ranked: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const evidence = relations.map((relation, index) => ({
    index,
    predictor: relation.predictorLabel,
    comparison: relation.comparisonLabel,
    outcome: relation.outcomeLabel,
    effect: relation.effect,
    unit: relation.outcomeUnit,
    delayDays: relation.lagDays,
    sampleDays: relation.sampleSize,
    practicalRatio: relation.practicalRatio,
    stable: relation.stable,
  }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-6-luna",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 350,
        instructions: "Tu rédiges un bref récapitulatif descriptif de relations statistiques personnelles. Choisis au maximum 3 relations parmi les indices fournis, dans l'ordre le plus utile. Pour chacune, écris une note française très simple de 140 caractères maximum. N'invente aucune mesure, aucun effet, aucune cause ni conseil médical. Les associations ne prouvent pas la causalité. N'utilise que les données fournies.",
        input: JSON.stringify({ period: body.period, evidence }),
        text: { format: { type: "json_schema", name: "effects_summary", strict: true, schema: { type: "object", properties: { ranked: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, note: { type: "string" } }, required: ["index", "note"], additionalProperties: false } } }, required: ["ranked"], additionalProperties: false } } },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "Summary unavailable." }, { status: 502 });
    const text = responseText(await response.json().catch(() => null));
    const ranked = text ? parseRanked(JSON.parse(text), relations.length) : null;
    if (!ranked) return NextResponse.json({ error: "Summary unavailable." }, { status: 502 });
    return NextResponse.json({ ranked }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Summary unavailable." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
