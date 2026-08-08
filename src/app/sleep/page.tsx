import type { Metadata } from "next";

import { AnalyticsDetail } from "@/components/analytics-detail";
import { getMetricDetail } from "@/services/details";

export const metadata: Metadata = { title: "Sleep" };

export default async function SleepPage() {
  const points = await getMetricDetail("sleep");
  return <AnalyticsDetail kind="sleep" eyebrow="Last complete night" title="Sleep" description="See how duration, efficiency, and regularity support your estimated need." points={points} primaryLabel="Time asleep" secondaryLabel="Regularity" explanation="70% of the score comes from meeting your estimated sleep need. Efficiency and regularity contribute 15% each." recommendation="Keep your next sleep window close to your established schedule when the data supports it." />;
}
