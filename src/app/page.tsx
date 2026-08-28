import { Suspense } from "react";

import {
  PersonalLabAnalysisLoading,
  PersonalLabAnalysisSection,
  PersonalLabJournalLoading,
  PersonalLabJournalSection,
  PersonalLabOverviewLoading,
  PersonalLabOverviewSection,
} from "@/components/lab/personal-lab";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { createPersonalLabStream, type PersonalLabStream } from "@/services/personal-lab";

type ConnectionNotice = "health" | "calendar" | null;

async function LabOverview({ stream, connectionNotice }: { stream: PersonalLabStream; connectionNotice: ConnectionNotice }) {
  return <PersonalLabOverviewSection data={await stream.overview} connectionNotice={connectionNotice} />;
}

async function LabJournal({ stream }: { stream: PersonalLabStream }) {
  return <PersonalLabJournalSection data={await stream.journal} />;
}

async function LabAnalysis({ stream }: { stream: PersonalLabStream }) {
  return <PersonalLabAnalysisSection data={await stream.analysis} />;
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ health?: string | string[]; calendar?: string | string[] }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) return <PublicHome />;

  const connectionNotice = params.calendar === "connected" ? "calendar" : params.health === "connected" || params.health === "connected_partial" ? "health" : null;
  const stream = createPersonalLabStream(user, { periods: [90] });
  return <div id="main-page-content" className="personal-lab-page lab-entry">
    <Suspense fallback={<PersonalLabOverviewLoading />}><LabOverview stream={stream} connectionNotice={connectionNotice} /></Suspense>
    <Suspense fallback={<PersonalLabJournalLoading />}><LabJournal stream={stream} /></Suspense>
    <Suspense fallback={<PersonalLabAnalysisLoading />}><LabAnalysis stream={stream} /></Suspense>
  </div>;
}
