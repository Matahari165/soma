import type { PersonalLabStream } from "@/services/personal-lab";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { ObservatoryRadar } from "./observatory-radar";
import { LabWorldWorkspace } from "./lab-world-workspace";
import { arrivalMessageFor } from "@/domain/lab/arrival-message";
import { isLocalPreviewMode } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabActivitySummaries } from "@/services/health-analytics";

export async function LabWorldJournalPreview({ stream }: { stream: Pick<PersonalLabStream, "journal"> }) {
  const journal = await stream.journal;
  return <PersonalLabJournalWorkspace data={journal} recentDatesFirst showVariantSwitcher={isLocalPreviewMode()} />;
}

export async function LabWorldPreview({ stream }: { stream: Pick<PersonalLabStream, "overview" | "journal"> }) {
  const overview = await stream.overview;
  const rangeStart = new Date(`${overview.todayDate}T12:00:00.000Z`);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 6);
  const user = await getCurrentUser();
  const activitySummaries = user
    ? await getPersonalLabActivitySummaries(user.id, rangeStart.toISOString().slice(0, 10), overview.todayDate).catch(() => [])
    : [];
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${overview.todayDate}T12:00:00`));
  const personalization = {
    name: overview.greetingName,
    timeZone: overview.timeZone,
    activity: overview.today.activity,
    initialMessage: arrivalMessageFor({ name: overview.greetingName, timeZone: overview.timeZone, activity: overview.today.activity }),
  } as const;
  return <LabWorldWorkspace
    date={date}
    radar={<ObservatoryRadar data={overview.today} />}
    overview={overview}
    activitySummaries={activitySummaries}
    journalPromise={stream.journal}
    personalization={personalization}
  />;
}
