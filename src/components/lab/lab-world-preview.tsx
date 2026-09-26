import type { PersonalLabStream } from "@/services/personal-lab";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { ObservatoryRadar } from "./observatory-radar";
import { LabWorldWorkspace } from "./lab-world-workspace";
import { arrivalMessageFor } from "@/domain/lab/arrival-message";
import { isLocalPreviewMode } from "@/lib/env";
import type { PersonalLabActivitySummariesResult } from "@/domain/lab/activity-summary";
import styles from "./lab-world-motion.module.css";

export async function LabWorldJournalPreview({ stream }: { stream: Pick<PersonalLabStream, "journal"> }) {
  const journal = await stream.journal;
  return <PersonalLabJournalWorkspace data={journal} recentDatesFirst showVariantSwitcher={isLocalPreviewMode()} />;
}

export async function LabWorldPreview({ stream, activitySummariesPromise }: {
  stream: Pick<PersonalLabStream, "overview" | "journal">;
  activitySummariesPromise?: Promise<PersonalLabActivitySummariesResult>;
}) {
  const overview = await stream.overview;
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${overview.todayDate}T12:00:00`));
  const personalization = {
    name: overview.greetingName,
    timeZone: overview.timeZone,
    activity: overview.today.activity,
    initialMessage: arrivalMessageFor({ name: overview.greetingName, timeZone: overview.timeZone, activity: overview.today.activity }),
  } as const;
  return <LabWorldWorkspace
    className={styles.observatoryScroll}
    date={date}
    radar={<ObservatoryRadar data={overview.today} />}
    overview={overview}
    activitySummariesPromise={activitySummariesPromise}
    journalPromise={stream.journal}
    personalization={personalization}
  />;
}
