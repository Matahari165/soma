import type { Metadata } from "next";

import { AnalyticsDetail } from "@/components/analytics-detail";
import { getMetricDetail } from "@/services/details";

export const metadata: Metadata = { title: "Recovery" };

export default async function RecoveryPage() {
  const points = await getMetricDetail("recovery");
  return <AnalyticsDetail eyebrow="Today" title="Recovery" description="Understand how your physiology compares with your own recent range." points={points} stats={[
    { label: "HRV", value: "51 ms", note: "Back within your normal 30-day range." },
    { label: "Resting heart rate", value: "58 bpm", note: "Two beats below your seven-day average." },
    { label: "Sleep support", value: "Good", note: "Duration improved, while regularity has room to build." },
  ]} primaryLabel="HRV (ms)" secondaryLabel="Resting heart rate (bpm)" explanation="Recovery compares HRV and resting heart rate with your own 30-day baseline, then adds sleep support. Soma withholds the score when inputs are incomplete." recommendation="Your signals support a normal training day; still adjust to how you feel." />;
}
