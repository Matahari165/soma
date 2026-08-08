import { Dashboard } from "@/components/dashboard/dashboard";
import { getDataMode } from "@/lib/env";
import { getDashboardSnapshot } from "@/services/dashboard";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ health?: string | string[] }> }) {
  const data = await getDashboardSnapshot();
  const healthStatus = (await searchParams).health;
  return <div id="main-page-content"><Dashboard data={data} demoMode={getDataMode() === "demo"} healthConnected={healthStatus === "connected"} /></div>;
}
