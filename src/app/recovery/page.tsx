import type { Metadata } from "next";

import { RecoveryDetails } from "@/components/health/recovery-details";
import { getHealthAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: "Recovery" };

export default async function RecoveryPage() {
  return <RecoveryDetails data={await getHealthAnalytics()} />;
}
