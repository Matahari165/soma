import { NextResponse } from "next/server";

import { requireServerEnv } from "@/lib/env";
import { processNextMealAnalysis, purgeExpiredFailedAnalysisPhotos, reconcileAbandonedMealPhotoUploads, reconcileMealPhotoPurges, requeueRetryableMealAnalyses } from "@/services/meals";

/** Stay within the Vercel Hobby function ceiling; provider work is bounded below it. */
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = requireServerEnv("CRON_SECRET");
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    // Keep recovery in the same minute tick as analysis so it continues while
    // the app is closed: queued jobs, failed retries and R2 purges all advance
    // without a user request.
    const [requeued, purgedExpired, purgeRetry, uploadCleanup] = await Promise.all([
      typeof requeueRetryableMealAnalyses === "function" ? requeueRetryableMealAnalyses().catch((error) => {
        console.warn("[meal-analysis] retry reconciliation failed", { stage: "retry_requeue", reason: error instanceof Error ? error.name : "unknown" });
        return 0;
      }) : Promise.resolve(0),
      typeof purgeExpiredFailedAnalysisPhotos === "function" ? purgeExpiredFailedAnalysisPhotos().catch((error) => {
        console.warn("[meal-analysis] expired-photo reconciliation failed", { stage: "photo_purge_failed_ttl", reason: error instanceof Error ? error.name : "unknown" });
        return 0;
      }) : Promise.resolve(0),
      typeof reconcileMealPhotoPurges === "function" ? reconcileMealPhotoPurges().catch((error) => {
        console.warn("[meal-analysis] photo-purge reconciliation failed", { stage: "photo_purge_retry", reason: error instanceof Error ? error.name : "unknown" });
        return { attempted: 0, purged: 0 };
      }) : Promise.resolve({ attempted: 0, purged: 0 }),
      reconcileAbandonedMealPhotoUploads().catch((error) => {
        console.warn("[meal-analysis] upload reconciliation failed", { stage: "photo_upload_cleanup", reason: error instanceof Error ? error.name : "unknown" });
        return { attempted: 0, cleared: 0 };
      }),
    ]);
    const result = await processNextMealAnalysis();
    const body: Record<string, unknown> = { processed: result.processed, status: result.analysis?.status ?? "idle" };
    if (requeued > 0 || purgedExpired > 0 || purgeRetry.attempted > 0 || uploadCleanup.attempted > 0) Object.assign(body, { requeued, purgedExpired, purgeRetry, uploadCleanup });
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[meal-analysis] worker invocation failed", { stage: "worker_invocation", reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Meal analysis worker unavailable." }, { status: 503 });
  }
}
