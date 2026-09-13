export type ArrivalMoment = "night" | "wake" | "morning" | "afternoon" | "evening";

export type ArrivalActivity =
  | { kind: "run"; distanceKm: number | null; durationMinutes: number | null }
  | { kind: "intense"; intensityMinutes: number };

export type ArrivalActivitySignals = {
  runningDistanceKm?: number | null;
  runningDurationMinutes?: number | null;
  runningPaceSecondsPerKm?: number | null;
  vigorousZoneMinutes?: number | null;
  peakZoneMinutes?: number | null;
  dataQuality?: { presentTypes?: string[] };
};

export type ArrivalMessage = {
  moment: ArrivalMoment;
  lines: readonly [string, string];
  activityNote: string | null;
};

type Phrase = readonly [string, string];

const RELIABLE_ACTIVITY_DATA_TYPES = new Set([
  "steps",
  "exercise",
  "daily-exercise-summary",
  "distance",
  "active-minutes",
  "active-zone-minutes",
  "time-in-heart-rate-zone",
  "sedentary-period",
]);

const BASE_PHRASES: Record<ArrivalMoment, readonly Phrase[]> = {
  night: [
    ["Bonne nuit {name}.", "Le jour se pose."],
    ["Bonsoir {name}.", "Le labo passe au calme."],
    ["{name},", "temps de récupérer."],
    ["Bonne nuit {name}.", "Les signaux attendront."],
    ["Bonsoir {name}.", "Le repos prend place."],
    ["{name},", "la nuit mesure."],
    ["Bonne nuit {name}.", "On ferme doucement."],
    ["Bonsoir {name}.", "Le calme est utile."],
    ["{name},", "place au repos."],
    ["Bonne nuit {name}.", "À demain."],
  ],
  wake: [
    ["Bonjour {name}.", "Le jour s’ouvre."],
    ["Bonjour {name}.", "Te voilà réveillé."],
    ["Bonjour {name}.", "On écoute le corps."],
    ["Bonjour {name}.", "Le calme avant tout."],
    ["Bonjour {name}.", "Premier repère."],
    ["Bonjour {name}.", "Réveil en douceur."],
    ["Bonjour {name}.", "Un jour à observer."],
    ["Bonjour {name}.", "Les signaux sont là."],
    ["{name},", "comment vas-tu ?"],
    ["Bonjour {name}.", "Rien à forcer."],
  ],
  morning: [
    ["Bonjour {name}.", "La matinée avance."],
    ["{name},", "ton jour se dessine."],
    ["Bonjour {name}.", "Les repères sont là."],
    ["Bonjour {name}.", "Le corps donne le ton."],
    ["{name},", "ton énergie du jour."],
    ["Bonjour {name}.", "La matinée avance."],
    ["Bonjour {name}.", "Suis ton élan."],
    ["{name},", "quel rythme ?"],
    ["Bonjour {name}.", "Le jour avance."],
    ["Bonjour {name}.", "On lit la tendance."],
  ],
  afternoon: [
    ["Bon après-midi {name}.", "Ton énergie ?"],
    ["{name},", "des traces sont là."],
    ["Bon après-midi {name}.", "Le rythme se précise."],
    ["{name},", "un point à mi-jour."],
    ["Bon après-midi {name}.", "La suite compte."],
    ["{name},", "garde le fil du jour."],
    ["Bon après-midi {name}.", "L’après-midi révèle."],
    ["{name},", "encore des signaux."],
    ["Bon après-midi {name}.", "Effort et repos."],
    ["{name},", "où mène ce rythme ?"],
  ],
  evening: [
    ["Bonsoir {name}.", "Des traces du jour."],
    ["Bonsoir {name}.", "Voir ce qui reste."],
    ["{name},", "le jour se dépose."],
    ["Bonsoir {name}.", "Observer sans juger."],
    ["{name},", "quel signal retenir ?"],
    ["Bonsoir {name}.", "Le rythme ralentit."],
    ["Bonsoir {name}.", "Dernière lecture."],
    ["{name},", "le corps raconte."],
    ["Bonsoir {name}.", "Lire l’essentiel."],
    ["Bonsoir {name}.", "La journée s’achève."],
  ],
};

const RUN_PHRASES: Record<ArrivalMoment, readonly Phrase[]> = {
  night: [
    ["Bonne nuit {name}.", "Récupère après."],
    ["Bonsoir {name}.", "La course est faite."],
    ["{name},", "la course laisse trace."],
    ["Bonne nuit {name}.", "Course faite, repos."],
  ],
  wake: [
    ["Bonjour {name}.", "Ta course donne le ton."],
    ["Bonjour {name}.", "Une course, déjà."],
    ["{name},", "la course donne le ton."],
    ["Bonjour {name}.", "Une course, puis le jour."],
  ],
  morning: [
    ["Bonjour {name}.", "Course du matin."],
    ["{name},", "la course donne le ton."],
    ["Bonjour {name}.", "La course est visible."],
    ["Bonjour {name}.", "La matinée avance."],
  ],
  afternoon: [
    ["Bon après-midi {name}.", "Ta course donne le ton."],
    ["{name},", "la course reste là."],
    ["Bon après-midi {name}.", "La course laisse trace."],
    ["{name},", "La course reste là."],
  ],
  evening: [
    ["Bonsoir {name}.", "La course a marqué le jour."],
    ["{name},", "la course reste le signal fort."],
    ["Bonsoir {name}.", "La course reste présente."],
    ["Bonsoir {name}.", "Le jour finit en course."],
  ],
};

const INTENSE_PHRASES: Record<ArrivalMoment, readonly Phrase[]> = {
  night: [
    ["Bonne nuit {name}.", "Récupère après."],
    ["Bonsoir {name}.", "L’effort a marqué le jour."],
    ["{name},", "l’effort laisse trace."],
    ["Bonne nuit {name}.", "Effort fait, repos."],
  ],
  wake: [
    ["Bonjour {name}.", "L’effort donne déjà le ton."],
    ["Bonjour {name}.", "Le jour commence fort."],
    ["{name},", "un effort fort, déjà."],
    ["Bonjour {name}.", "Un effort soutenu est là."],
  ],
  morning: [
    ["Bonjour {name}.", "Une séance donne le ton."],
    ["{name},", "l’effort marque le matin."],
    ["Bonjour {name}.", "L’intensité est visible."],
    ["Bonjour {name}.", "Un effort fort, ce matin."],
  ],
  afternoon: [
    ["Bon après-midi {name}.", "L’effort du jour est là."],
    ["{name},", "l’intensité donne le ton."],
    ["Bon après-midi {name}.", "L’effort laisse trace."],
    ["{name},", "Le jour porte cet effort."],
  ],
  evening: [
    ["Bonsoir {name}.", "L’intensité a marqué le jour."],
    ["{name},", "l’effort est le signal fort."],
    ["Bonsoir {name}.", "L’effort reste présent."],
    ["Bonsoir {name}.", "Le jour finit fort."],
  ],
};

export const ARRIVAL_PHRASE_COUNTS = {
  base: Object.values(BASE_PHRASES).reduce((total, phrases) => total + phrases.length, 0),
  run: Object.values(RUN_PHRASES).reduce((total, phrases) => total + phrases.length, 0),
  intense: Object.values(INTENSE_PHRASES).reduce((total, phrases) => total + phrases.length, 0),
} as const;

function numeric(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: number | null | undefined) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function hasReliableActivityCoverage(day: ArrivalActivitySignals) {
  const presentTypes = day.dataQuality?.presentTypes;
  return !presentTypes || presentTypes.some((type) => RELIABLE_ACTIVITY_DATA_TYPES.has(type));
}

export function arrivalActivityFor(day: ArrivalActivitySignals | null | undefined): ArrivalActivity | null {
  if (!day || !hasReliableActivityCoverage(day)) return null;

  const runningDistanceKm = positive(day.runningDistanceKm);
  const runningDurationMinutes = positive(day.runningDurationMinutes);
  const runningPaceSecondsPerKm = positive(day.runningPaceSecondsPerKm);
  if (runningDistanceKm !== null && runningDurationMinutes !== null && runningDistanceKm >= 1.5 && runningDurationMinutes >= 10
    && (runningPaceSecondsPerKm === null || (runningPaceSecondsPerKm >= 180 && runningPaceSecondsPerKm <= 720))) {
    return { kind: "run", distanceKm: runningDistanceKm, durationMinutes: runningDurationMinutes };
  }

  const vigorousZoneMinutes = numeric(day.vigorousZoneMinutes);
  const peakZoneMinutes = numeric(day.peakZoneMinutes);
  const intensityMinutes = (vigorousZoneMinutes ?? 0) + (peakZoneMinutes ?? 0);
  if ((vigorousZoneMinutes !== null && vigorousZoneMinutes >= 15)
    || (peakZoneMinutes !== null && peakZoneMinutes >= 10)
    || (vigorousZoneMinutes !== null && peakZoneMinutes !== null && intensityMinutes >= 15)) {
    return { kind: "intense", intensityMinutes: Math.round(intensityMinutes) };
  }
  return null;
}

export function arrivalMomentFor(localMinutes: number): ArrivalMoment {
  if (localMinutes < 6 * 60 + 30) return "night";
  if (localMinutes < 7 * 60 + 30) return "wake";
  if (localMinutes < 12 * 60) return "morning";
  if (localMinutes < 18 * 60) return "afternoon";
  if (localMinutes < 22 * 60 + 30) return "evening";
  return "night";
}

function localDateParts(now: Date, timeZone: string) {
  const format = (zone: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone).formatToParts(now);
  } catch {
    parts = format("Europe/Paris").formatToParts(now);
  }
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");
  return { dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, localMinutes: hour * 60 + minute };
}

function stableIndex(value: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Jérémy";
}

function formatActivityNote(activity: ArrivalActivity) {
  if (activity.kind === "intense") return `Effort intense enregistré · ${activity.intensityMinutes} min en zones élevées`;
  const details = [
    activity.distanceKm === null ? null : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(activity.distanceKm)} km`,
    activity.durationMinutes === null ? null : `${Math.round(activity.durationMinutes)} min`,
  ].filter(Boolean);
  return `Course enregistrée${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

export function arrivalMessageFor({
  name,
  now = new Date(),
  timeZone = "Europe/Paris",
  activity = null,
}: {
  name: string;
  now?: Date;
  timeZone?: string;
  activity?: ArrivalActivity | null;
}): ArrivalMessage {
  const { dateKey, localMinutes } = localDateParts(now, timeZone);
  const moment = arrivalMomentFor(localMinutes);
  const catalog = activity?.kind === "run" ? RUN_PHRASES[moment]
    : activity?.kind === "intense" ? INTENSE_PHRASES[moment]
      : BASE_PHRASES[moment];
  const rotationWindow = Math.floor(localMinutes / 120);
  const phrase = catalog[stableIndex(`${dateKey}:${moment}:${rotationWindow}:${activity?.kind ?? "none"}`, catalog.length)];
  const displayName = firstName(name);
  return {
    moment,
    lines: phrase.map((line) => line.replace("{name}", displayName)) as [string, string],
    activityNote: activity ? formatActivityNote(activity) : null,
  };
}
