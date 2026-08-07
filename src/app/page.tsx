import { Dashboard } from "@/components/dashboard/dashboard";
import { getDataMode } from "@/lib/env";
import { getDashboardSnapshot } from "@/services/dashboard";

export default async function TodayPage() {
  const data = await getDashboardSnapshot();
  return <div id="main-page-content"><Dashboard data={data} demoMode={getDataMode() === "demo"} /></div>;
}
