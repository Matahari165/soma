import { Suspense } from "react";

import type { PersonalLabStream } from "@/services/personal-lab";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { PersonalLabJournalLoading } from "./personal-lab";
import { ObservatoryRadar } from "./observatory-radar";
import { LabWorldWorkspace } from "./lab-world-workspace";
import { arrivalMessageFor } from "@/domain/lab/arrival-message";
import { isLocalPreviewMode } from "@/lib/env";

export async function LabWorldJournalPreview({ stream }: { stream: Pick<PersonalLabStream, "journal"> }) {
  const journal = await stream.journal;
  return <PersonalLabJournalWorkspace data={journal} recentDatesFirst showVariantSwitcher={isLocalPreviewMode()} />;
}

export async function LabWorldPreview({ stream }: { stream: Pick<PersonalLabStream, "overview" | "journal"> }) {
  const overview = await stream.overview;
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${overview.todayDate}T12:00:00`));
  const personalization = {
    name: overview.greetingName,
    timeZone: overview.timeZone,
    activity: overview.today.activity,
    initialMessage: arrivalMessageFor({ name: overview.greetingName, timeZone: overview.timeZone, activity: overview.today.activity }),
  } as const;
  return <LabWorldWorkspace date={date} radar={<ObservatoryRadar data={overview.today} />}
    capture={<Suspense fallback={<PersonalLabJournalLoading />}><LabWorldJournalPreview stream={stream} /></Suspense>}
    personalization={personalization}
  />;
}
