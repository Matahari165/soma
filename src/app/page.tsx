import { Dashboard } from "@/components/dashboard/dashboard";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/services/dashboard";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ health?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  const data = await getDashboardSnapshot(user);
  const healthStatus = (await searchParams).health;
  const healthConnectionState = healthStatus === "connected" || healthStatus === "connected_partial" ? healthStatus : null;
  return <div id="main-page-content"><Dashboard data={data} healthConnectionState={healthConnectionState} /></div>;
}
