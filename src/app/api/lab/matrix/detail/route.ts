import { NextRequest, NextResponse } from "next/server";

import type { AnalysisPeriod } from "@/domain/lab/matrix";
import { isPersonalLabDisplayableRelation, summaryRelationKey } from "@/domain/lab/matrix";
import { parseStrongestEffectsRelationKey } from "@/domain/lab/strongest-effects-response";
import { getCurrentUser } from "@/lib/auth";
import { elapsedServerMs, serverNow, withServerTiming } from "@/lib/performance";
import { getPersonalLabMatrixWithTimings } from "@/services/personal-lab";
import { strongestEffectsGeneration } from "@/services/strongest-effects-generation";

export const maxDuration = 50;

function parsePeriod(value: string | null): AnalysisPeriod | null {
  if (value === "all") return "all";
  const numeric = Number(value);
  return numeric === 15 || numeric === 30 || numeric === 90 ? numeric : null;
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  const startedAt = serverNow();
  const authStartedAt = serverNow();
  const user = await getCurrentUser();
  const authMs = elapsedServerMs(authStartedAt);
  if (!user) return privateJson({ error: "Authentication required." }, 401);

  const params = request.nextUrl.searchParams;
  const period = parsePeriod(params.get("period"));
  const generation = params.get("generation");
  const relationKey = parseStrongestEffectsRelationKey(params.get("relationKey"));
  const requireTemporalStability = params.get("requireTemporalStability");
  if (period === null || !generation || !/^[A-Za-z0-9_-]{43}$/.test(generation) || !relationKey
    || (requireTemporalStability !== "true" && requireTemporalStability !== "false")) {
    return privateJson({ error: "Invalid relation detail request." }, 400);
  }

  const loaded = await getPersonalLabMatrixWithTimings(user, period, { persist: false });
  const generationStartedAt = serverNow();
  const currentGeneration = strongestEffectsGeneration(loaded.matrix);
  const generationMs = elapsedServerMs(generationStartedAt);
  if (currentGeneration !== generation) {
    return privateJson({ error: "The analysis changed. Reload this period before opening the relation." }, 409);
  }

  const requestedRelationKey = JSON.stringify(relationKey);
  const allRelations = loaded.matrix.rows.flatMap((row) => row.relations);
  const selected = allRelations.find((relation) => summaryRelationKey(relation) === requestedRelationKey);
  if (!selected || !isPersonalLabDisplayableRelation(selected, { requireTemporalStability: requireTemporalStability === "true" })) {
    return privateJson({ error: "Relation not found." }, 404);
  }

  const matchingRelations = allRelations.filter((relation) => relation.predictorId === selected.predictorId
    && relation.outcomeId === selected.outcomeId
    && summaryRelationKey(relation) !== requestedRelationKey
    && isPersonalLabDisplayableRelation(relation, { requireTemporalStability: requireTemporalStability === "true" }));
  const renderStartedAt = serverNow();
  const response = privateJson({ generation: currentGeneration, relations: [selected, ...matchingRelations] });
  const renderMs = elapsedServerMs(renderStartedAt);
  withServerTiming(response, [
    { name: "auth", durationMs: authMs },
    { name: "cache", durationMs: loaded.timings.cacheMs },
    { name: "data", durationMs: loaded.timings.dataMs },
    { name: "build", durationMs: loaded.timings.buildMs },
    { name: "generation", durationMs: generationMs },
    { name: "render", durationMs: renderMs },
    { name: "total", durationMs: elapsedServerMs(startedAt) },
  ]);
  response.headers.append("Server-Timing", `cache_state;desc="${loaded.timings.cacheStatus}"`);
  return response;
}
