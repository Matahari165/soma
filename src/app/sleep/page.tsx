import type { Metadata } from "next";
import { Suspense } from "react";

import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import { SleepDetails } from "@/components/health/sleep-details";
import { getSleepAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: { absolute: "Soma" } };

async function SleepPageContent() {
  return <SleepDetails data={await getSleepAnalytics()} />;
}

export default function SleepPage() {
  return <Suspense fallback={<HealthLoadingShell kind="sleep" title="Sommeil" />}><SleepPageContent /></Suspense>;
}
