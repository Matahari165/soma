import { Suspense } from "react";

import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { LabWorldPreview } from "@/components/lab/lab-world-preview";
import { createPersonalLabStream } from "@/services/personal-lab";
import { getPersonalLabActivitySummaries } from "@/services/health-analytics";
import type { PersonalLabActivitySummariesResult } from "@/domain/lab/activity-summary";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function TodayPageContent() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  const stream = createPersonalLabStream(user, { periods: [90], includeAnalysis: false });
  const activitySummariesPromise: Promise<PersonalLabActivitySummariesResult> = stream.activityDate.then((todayDate) => getPersonalLabActivitySummaries(
    user.id,
    addDays(todayDate, -6),
    todayDate,
  ).then((summaries) => ({ status: "ready" as const, summaries }), () => ({ status: "unavailable" as const }))).catch(() => ({ status: "unavailable" as const }));
  return <LabWorldPreview stream={stream} activitySummariesPromise={activitySummariesPromise} />;
}

export default function TodayPage() {
  return <Suspense fallback={<div id="main-page-content" className="lab-world-loading" role="status" aria-live="polite" aria-label="Loading laboratory">Loading laboratory…</div>}><TodayPageContent /></Suspense>;
}
