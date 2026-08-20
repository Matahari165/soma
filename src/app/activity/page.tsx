import type { Metadata } from "next";

import { ActivityDetails } from "@/components/health/activity-details";
import { getActivityAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  return <ActivityDetails data={await getActivityAnalytics()} />;
}
