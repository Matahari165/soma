import { Suspense } from "react";

import { PersonalLab } from "@/components/lab/personal-lab";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

import Loading from "./loading";

type ConnectionNotice = "health" | "calendar" | null;

async function AuthenticatedLab({ user, connectionNotice }: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; connectionNotice: ConnectionNotice }) {
  const data = await getPersonalLabSnapshot(user, { periods: [30] });
  return <div id="main-page-content"><PersonalLab data={data} connectionNotice={connectionNotice} /></div>;
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ health?: string | string[]; calendar?: string | string[] }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) return <PublicHome />;

  const connectionNotice = params.calendar === "connected" ? "calendar" : params.health === "connected" || params.health === "connected_partial" ? "health" : null;
  return <Suspense fallback={<Loading />}><AuthenticatedLab user={user} connectionNotice={connectionNotice} /></Suspense>;
}
