import type { Metadata } from "next";

import { AnalyticsDetail } from "@/components/analytics-detail";
import { getMetricDetail } from "@/services/details";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const points = await getMetricDetail("effort");
  return <AnalyticsDetail eyebrow="Today so far" title="Activity" description="Balance today's effort with the target that supports your goal across the whole week." points={points} stats={[
    { label: "Target zone", value: "62–74", note: "Today's recommended effort range." },
    { label: "Zone minutes", value: "18 min", note: "Most time was accumulated in zones 1 and 2." },
    { label: "Steps", value: "4,620", note: "On track for this time of day." },
  ]} primaryLabel="Steps" secondaryLabel="Zone minutes" explanation="Completed effort combines heart-rate-zone minutes, exercise duration, active energy, and movement. Your target is calculated separately from recovery and your weekly goal." recommendation="A 45-minute strength session fits today's remaining target." />;
}
