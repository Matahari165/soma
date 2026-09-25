type RunningSession = {
  daysAgo: number;
  distanceKm: number;
  durationMinutes: number;
  averageHeartRateBpm: number;
};

const DAY_MS = 86_400_000;

// Synthetic sessions for three complete, rolling seven-day windows.
const runningWeeks: Array<{ fromDaysAgo: number; toDaysAgo: number; sessions: RunningSession[] }> = [
  { fromDaysAgo: 20, toDaysAgo: 14, sessions: [
    { daysAgo: 20, distanceKm: 4.5, durationMinutes: 30, averageHeartRateBpm: 139 },
    { daysAgo: 18, distanceKm: 6, durationMinutes: 39, averageHeartRateBpm: 146 },
    { daysAgo: 16, distanceKm: 4.5, durationMinutes: 29, averageHeartRateBpm: 141 },
  ] },
  { fromDaysAgo: 13, toDaysAgo: 7, sessions: [
    { daysAgo: 13, distanceKm: 5, durationMinutes: 32, averageHeartRateBpm: 141 },
    { daysAgo: 11, distanceKm: 7.2, durationMinutes: 46, averageHeartRateBpm: 149 },
    { daysAgo: 9, distanceKm: 6.1, durationMinutes: 39, averageHeartRateBpm: 145 },
  ] },
  { fromDaysAgo: 6, toDaysAgo: 0, sessions: [
    { daysAgo: 6, distanceKm: 6, durationMinutes: 37, averageHeartRateBpm: 144 },
    { daysAgo: 4, distanceKm: 8, durationMinutes: 49, averageHeartRateBpm: 151 },
    { daysAgo: 2, distanceKm: 7, durationMinutes: 43, averageHeartRateBpm: 147 },
  ] },
];

function pace(secondsPerKm: number) {
  const seconds = Math.round(secondsPerKm);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}/km`;
}

export function previewRunningContext(now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const date = (daysAgo: number) => new Date(today - daysAgo * DAY_MS).toISOString().slice(0, 10);
  const number = (value: number) => new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(value);

  return [
    "Courses fictives de démonstration : neuf séances sur les 21 derniers jours, réparties en trois périodes glissantes de sept jours. Ces données ne proviennent pas du compte utilisateur.",
    ...runningWeeks.map((week, index) => {
      const distanceKm = week.sessions.reduce((total, session) => total + session.distanceKm, 0);
      const durationMinutes = week.sessions.reduce((total, session) => total + session.durationMinutes, 0);
      const sessions = week.sessions.map((session) =>
        `${date(session.daysAgo)} : ${number(session.distanceKm)} km, ${session.durationMinutes} min, ${pace(session.durationMinutes * 60 / session.distanceKm)}, FC moyenne ${session.averageHeartRateBpm} bpm`,
      ).join(" ; ");
      return `Période ${index + 1} (${date(week.fromDaysAgo)} au ${date(week.toDaysAgo)}) : ${week.sessions.length} séances, ${number(distanceKm)} km, ${durationMinutes} min, allure moyenne pondérée ${pace(durationMinutes * 60 / distanceKm)}. Séances : ${sessions}.`;
    }),
    "La liste est complète pour cette démonstration seulement. N'extrapole ni objectifs, ni blessure, ni autres mesures ; distingue toujours cette simulation des données de santé réelles.",
  ].join("\n");
}
