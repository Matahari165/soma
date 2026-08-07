import type { Metadata } from "next";

import { AnalyticsDetail } from "@/components/analytics-detail";
import { getMetricDetail } from "@/services/details";

export const metadata: Metadata = { title: "Sleep" };

export default async function SleepPage() {
  const points = await getMetricDetail("sleep");
  return <AnalyticsDetail eyebrow="Last night" title="Sleep" description="See how duration, efficiency, and regularity support your estimated need." points={points} stats={[
    { label: "Time asleep", value: "7h 34m", note: "28 minutes above your seven-day average." },
    { label: "Estimated need", value: "8h 18m", note: "Includes a small recent sleep-debt adjustment." },
    { label: "Regularity", value: "81%", note: "Bedtime varied by about 38 minutes this week." },
  ]} primaryLabel="Minutes asleep" secondaryLabel="Regularity (%)" explanation="70% of the score comes from meeting your estimated sleep need. Efficiency and regularity contribute 15% each." recommendation="Start winding down around 10:17 PM for a 10:47 PM bedtime." />;
}
