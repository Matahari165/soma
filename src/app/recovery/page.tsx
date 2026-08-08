import type { Metadata } from "next";

import { AnalyticsDetail } from "@/components/analytics-detail";
import { getMetricDetail } from "@/services/details";

export const metadata: Metadata = { title: "Recovery" };

export default async function RecoveryPage() {
  const points = await getMetricDetail("recovery");
  return <AnalyticsDetail kind="recovery" eyebrow="Latest complete reading" title="Recovery" description="Understand how your physiology compares with your own recent range." points={points} primaryLabel="HRV" secondaryLabel="Resting heart rate" explanation="Recovery compares HRV and resting heart rate with your own 30-day baseline, then adds sleep support. Soma withholds the score when inputs are incomplete." recommendation="Use this signal alongside how you feel before deciding today’s training intensity." />;
}
