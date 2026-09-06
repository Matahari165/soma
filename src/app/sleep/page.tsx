import type { Metadata } from "next";

import { SleepDetails } from "@/components/health/sleep-details";
import { getSleepAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function SleepPage() {
  return <SleepDetails data={await getSleepAnalytics()} />;
}
