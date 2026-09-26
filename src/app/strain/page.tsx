import type { Metadata } from "next";
import { Suspense } from "react";

import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import { ActivityDetails } from "@/components/health/activity-details";
import { getActivityAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: { absolute: "Strain · Soma" } };

async function StrainPageContent() {
  return <ActivityDetails data={await getActivityAnalytics()} />;
}

export default function StrainPage() {
  return <Suspense fallback={<HealthLoadingShell kind="activity" title="Strain" />}><StrainPageContent /></Suspense>;
}
