import { after, NextResponse } from "next/server";

import { mealAnalysisCorrectionSchema, mealAnalysisRequestSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToApi } from "@/services/meal-api";
import { analyzePreviewMeal, findPreviewMeal, streamPreviewMeal } from "@/services/meal-preview";
import { enqueueMealAnalysis, findMeal, MealServiceError, processNextMealAnalysis, streamMealAnalysis } from "@/services/meals";

function analysisRequestId(request: Request, fallback?: string) {
  const supplied = request.headers.get("x-analysis-request-id") ?? fallback;
  return supplied && /^[a-zA-Z0-9._:-]{8,160}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function jsonWithRequestId(body: unknown, init: ResponseInit, requestId: string) {
  const headers = new Headers(init.headers);
  headers.set("X-Analysis-Request-Id", requestId);
  return NextResponse.json(body, { ...init, headers });
}

function startQueuedMealAnalysis(userId: string, analysisId: string, requestId: string) {
  after(async () => {
    try {
      await processNextMealAnalysis({ userId, analysisId });
    } catch (error) {
      console.error("[meal-analysis] immediate background worker failed", {
        requestId,
        stage: "immediate_worker",
        reason: error instanceof Error ? error.name : "unknown",
      });
    }
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const bodyIdempotencyKey = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).idempotencyKey === "string"
    ? (body as Record<string, unknown>).idempotencyKey as string
    : undefined;
  const requestId = analysisRequestId(request, bodyIdempotencyKey);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonWithRequestId({ error: "The analysis request is invalid.", code: "INVALID_MEAL_INPUT", requestId }, { status: 400 }, requestId);
  const parsed = mealAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) return jsonWithRequestId({ error: "The analysis request is invalid.", code: "INVALID_MEAL_INPUT", requestId }, { status: 400 }, requestId);
  const correctionValue = body && typeof body === "object" ? (body as Record<string, unknown>).correction : undefined;
  const correction = correctionValue === undefined ? undefined : mealAnalysisCorrectionSchema.safeParse(correctionValue);
  if (correction && !correction.success) return jsonWithRequestId({ error: "The analysis correction is invalid.", code: "INVALID_MEAL_INPUT", requestId }, { status: 400 }, requestId);
  const analysisOptions = correction?.success ? { ...parsed.data, correction: correction.data } : parsed.data;
  const { id } = await context.params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream") || new URL(request.url).searchParams.get("stream") === "true" || (body && typeof body === "object" && Boolean((body as any).stream));

  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
        try {
          if (isLocalPreviewMode()) {
            await streamPreviewMeal(user.id, id, correction?.success ? { correction: correction.data } : undefined, async (event) => {
              if (event.type === "complete") {
                sendEvent("complete", { meal: event.meal ? mealToApi(event.meal) : null, analysis: event.analysis });
              } else if (event.type === "error") {
                sendEvent("error", { error: event.error, code: event.code });
              } else {
                sendEvent(event.type, event);
              }
            });
          } else {
            await streamMealAnalysis(user.id, id, { ...analysisOptions, analysisRequestId: requestId }, async (event) => {
              if (event.type === "complete") {
                sendEvent("complete", { meal: event.meal ? mealToApi(event.meal) : null, analysis: event.analysis });
              } else if (event.type === "error") {
                sendEvent("error", { error: event.error, code: event.code });
              } else {
                sendEvent(event.type, event);
              }
            }, request.signal);
          }
        } catch (error) {
          sendEvent("error", { error: error instanceof Error ? error.message : "Stream failed", code: "UNKNOWN_STREAM_ERROR" });
        } finally {
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Analysis-Request-Id": requestId,
      }
    });
  }

  if (isLocalPreviewMode()) {
    try {
      const result = analyzePreviewMeal(user.id, id, correction?.success ? { correction: correction.data } : undefined);
      if (!result) return jsonWithRequestId({ error: "Meal not found.", code: "not_found", requestId }, { status: 404 }, requestId);
      const meal = findPreviewMeal(user.id, id);
      return jsonWithRequestId({ analysis: result.analysis, fresh: true, meal: meal ? mealToApi(meal) : null, preview: true, requestId }, {}, requestId);
    } catch (error) {
      return jsonWithRequestId({ error: error instanceof Error ? error.message : "Meal analysis is unavailable.", code: "UNKNOWN_ANALYSIS_ERROR", requestId }, { status: 400 }, requestId);
    }
  }
  try {
    const result = await enqueueMealAnalysis(user.id, id, { ...analysisOptions, analysisRequestId: requestId });
    if (result.queued) startQueuedMealAnalysis(user.id, result.analysis.id, requestId);
    const meal = await findMeal(user.id, id);
    if (!meal) return jsonWithRequestId({ error: "The meal could not be reloaded.", code: "STORAGE_ERROR", requestId }, { status: 503 }, requestId);
    return jsonWithRequestId({ analysis: result.analysis, fresh: result.fresh, queued: result.queued, meal: mealToApi(meal), requestId }, { status: result.queued ? 202 : 200 }, requestId);
  } catch (error) {
    if (error instanceof MealServiceError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
      return jsonWithRequestId({ error: error.message, code: error.diagnosticCode ?? error.code, requestId }, { status }, requestId);
    }
    console.error("[meal-analysis] route failed outside service taxonomy", { requestId, stage: "route", reason: error instanceof Error ? error.name : "unknown" });
    return jsonWithRequestId({ error: "L’analyse du repas n’est pas disponible pour le moment.", code: "UNKNOWN_ANALYSIS_ERROR", requestId }, { status: 503 }, requestId);
  }
}

/** Durable status read used after a mobile app resumes or reconnects. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  try {
    const meal = await findMeal(user.id, id);
    if (!meal) return jsonWithRequestId({ error: "Meal not found.", code: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } }, crypto.randomUUID());
    const requestId = request.headers.get("x-analysis-request-id") ?? crypto.randomUUID();
    return jsonWithRequestId({ analysis: meal.analysis, meal: mealToApi(meal), requestId }, { headers: { "Cache-Control": "private, no-store" } }, requestId);
  } catch (error) {
    console.error("[meal-analysis] status route failed", { stage: "status_route", reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "L’état de l’analyse n’est pas disponible pour le moment.", code: "STORAGE_ERROR" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
