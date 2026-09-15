import type { Metadata } from "next";
import { Suspense } from "react";

import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import { ActivityDetails } from "@/components/health/activity-details";
import { getActivityAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: { absolute: "Soma" } };

async function ActivityPageContent() {
  return <ActivityDetails data={await getActivityAnalytics()} />;
}

export default function ActivityPage() {
  return <Suspense fallback={<HealthLoadingShell kind="activity" title="Effort" />}><ActivityPageContent /></Suspense>;
}
