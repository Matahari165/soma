import { PersonalLab } from "@/components/lab/personal-lab";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ health?: string | string[]; calendar?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  const data = await getPersonalLabSnapshot(user);
  const params = await searchParams;
  const connectionNotice = params.calendar === "connected" ? "calendar" : params.health === "connected" || params.health === "connected_partial" ? "health" : null;
  return <div id="main-page-content"><PersonalLab data={data} connectionNotice={connectionNotice} /></div>;
}
