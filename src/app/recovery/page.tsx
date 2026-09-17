import type { Metadata } from "next";
import { Suspense } from "react";

import { HealthLoadingShell } from "@/components/health/health-loading-shell";
import { RecoveryDetails } from "@/components/health/recovery-details";
import { getRecoveryAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: { absolute: "Recovery — Soma" } };

async function RecoveryPageContent() {
  return <RecoveryDetails data={await getRecoveryAnalytics()} />;
}

export default function RecoveryPage() {
  return <Suspense fallback={<HealthLoadingShell kind="recovery" title="Recovery" />}><RecoveryPageContent /></Suspense>;
}
