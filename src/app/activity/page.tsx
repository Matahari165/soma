import type { Metadata } from "next";

import { AnalyticsDetail } from "@/components/analytics-detail";
import { getMetricDetail } from "@/services/details";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const points = await getMetricDetail("effort");
  return <AnalyticsDetail kind="effort" eyebrow="Latest complete day" title="Activity" description="Balance measured effort with the target that supports your goal across the whole week." points={points} primaryLabel="Steps" secondaryLabel="Zone minutes" explanation="Completed effort combines heart-rate-zone minutes, exercise duration, active energy, and movement. Your target is calculated separately from recovery and your weekly goal." recommendation="Review the measured load and your recovery signal before adding another session." />;
}
