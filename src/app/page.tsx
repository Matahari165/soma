import { Suspense } from "react";

import {
  PersonalLabJournalLoading,
  PersonalLabJournalSection,
  PersonalLabOverviewLoading,
  PersonalLabOverviewSection,
} from "@/components/lab/personal-lab";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { createPersonalLabStream, type PersonalLabStream } from "@/services/personal-lab";

type ConnectionNotice = "health" | "calendar" | null;

type PersonalLabPageStream = Pick<PersonalLabStream, "overview" | "journal">;

async function LabOverview({ stream, connectionNotice }: { stream: PersonalLabPageStream; connectionNotice: ConnectionNotice }) {
  return <PersonalLabOverviewSection data={await stream.overview} connectionNotice={connectionNotice} />;
}

async function LabJournal({ stream }: { stream: PersonalLabPageStream }) {
  return <PersonalLabJournalSection data={await stream.journal} />;
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ health?: string | string[]; calendar?: string | string[] }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) return <PublicHome />;

  const connectionNotice = params.calendar === "connected" ? "calendar" : params.health === "connected" || params.health === "connected_partial" ? "health" : null;
  const stream = createPersonalLabStream(user, { periods: [90], includeAnalysis: false });
  return <div id="main-page-content" className="personal-lab-page lab-entry">
    <Suspense fallback={<PersonalLabOverviewLoading />}><LabOverview stream={stream} connectionNotice={connectionNotice} /></Suspense>
    <Suspense fallback={<PersonalLabJournalLoading />}><LabJournal stream={stream} /></Suspense>
  </div>;
}
