import type { PersonalLabStream } from "@/services/personal-lab";
import { StrongestEffectsPanel } from "./correlation-matrix";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import { ObservatoryRadar } from "./observatory-radar";
import { LabWorldWorkspace } from "./lab-world-workspace";
import { arrivalMessageFor } from "@/domain/lab/arrival-message";

export async function LabWorldPreview({ stream }: { stream: Pick<PersonalLabStream, "overview" | "journal"> }) {
  const [overview, journal] = await Promise.all([stream.overview, stream.journal]);
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${overview.todayDate}T12:00:00`));
  const personalization = {
    name: overview.greetingName,
    timeZone: overview.timeZone,
    activity: overview.today.activity,
    initialMessage: arrivalMessageFor({ name: overview.greetingName, timeZone: overview.timeZone, activity: overview.today.activity }),
  } as const;
  return <LabWorldWorkspace date={date} radar={<ObservatoryRadar data={overview.today} />}
    effects={<StrongestEffectsPanel />}
    capture={<PersonalLabJournalWorkspace data={journal} recentDatesFirst />}
    personalization={personalization}
  />;
}
