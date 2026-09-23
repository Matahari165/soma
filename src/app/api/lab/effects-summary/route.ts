import { NextRequest, NextResponse } from "next/server";

import { selectSummaryRelations, summaryRelationKey, type AnalysisPeriod } from "@/domain/lab/matrix";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

function validPeriod(value: unknown): value is AnalysisPeriod {
  return value === 15 || value === 30 || value === 90 || value === "all";
}

function responseText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text as string).join("") || null;
}

function parseRanked(value: unknown, count: number): number[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { ranked?: unknown }).ranked)) return null;
  const ranked = (value as { ranked: unknown[] }).ranked;
  if (!ranked.length || ranked.length > Math.min(3, count)) return null;
  const seen = new Set<number>();
  const safe: number[] = [];
  for (const item of ranked) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= count || seen.has(item)) return null;
    seen.add(item);
    safe.push(item);
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

  let snapshot: Awaited<ReturnType<typeof getPersonalLabSnapshot>>;
  try {
    snapshot = await getPersonalLabSnapshot(user, { periods: [body.period] });
  } catch {
    return NextResponse.json({ error: "Summary unavailable." }, { status: 503 });
  }
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
        max_output_tokens: 120,
        instructions: "Choisis au maximum 3 relations parmi les indices fournis, dans l'ordre le plus utile. Retourne uniquement leurs indices. N'invente aucune relation. Les associations ne prouvent pas la causalité.",
        input: JSON.stringify({ period: body.period, evidence }),
        text: { format: { type: "json_schema", name: "effects_summary", strict: true, schema: { type: "object", properties: { ranked: { type: "array", minItems: 1, maxItems: 3, items: { type: "integer" } } }, required: ["ranked"], additionalProperties: false } } },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "Summary unavailable." }, { status: 502 });
    const text = responseText(await response.json().catch(() => null));
    const ranked = text ? parseRanked(JSON.parse(text), relations.length) : null;
    if (!ranked) return NextResponse.json({ error: "Summary unavailable." }, { status: 502 });
    return NextResponse.json({ ranked: ranked.map((index) => summaryRelationKey(relations[index])) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Summary unavailable." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
