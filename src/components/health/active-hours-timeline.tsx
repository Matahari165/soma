import { Check, Minus, Circle, Clock } from "lucide-react";
import type { ActiveHoursSummary } from "@/domain/health/active-hours";
import styles from "./active-hours-timeline.module.css";

const states = { active: "Active", observed_inactive: "Non validée", unknown: "Données manquantes", pending: "En cours", sleeping: "Sommeil" };

export function ActiveHoursTimeline({ summary, importedAt }: { summary: ActiveHoursSummary; importedAt: string | null }) {
  const unknown = summary.hourStates.filter((hour) => hour.status === "unknown").length;
  return <section className={styles.root} aria-labelledby="active-hours-title">
    <div className={styles.heading}><h2 id="active-hours-title">Heures actives</h2><p><strong>{summary.observedHours === 0 ? "—" : `${unknown > 0 ? "≥ " : ""}${summary.activeHours}`}</strong> / {summary.elapsedHours} heures écoulées</p></div>
    <ol className={styles.hours} aria-label="Activité par heure, sommeil exclu">
      {summary.hourStates.filter((hour) => hour.status !== "sleeping").map((hour) => {
        const Icon = hour.status === "active" ? Check : hour.status === "unknown" ? Minus : hour.status === "pending" ? Clock : Circle;
        return <li key={hour.key} className={styles.hour} data-state={hour.status} title={`${hour.label} : ${states[hour.status]}`}><span className={styles.mark}><Icon size={16} aria-hidden="true" /></span><span>{hour.label}</span><span className="sr-only">{states[hour.status]}</span></li>;
      })}
    </ol>
    <div className={styles.legend}><span><Check size={14} aria-hidden="true" /> Active</span><span><Circle size={14} aria-hidden="true" /> Non validée</span><span><Minus size={14} aria-hidden="true" /> Inconnue</span><span><Clock size={14} aria-hidden="true" /> En cours</span></div>
    <p className={styles.context}>{unknown > 0 ? `${unknown} ${unknown === 1 ? "heure inconnue" : "heures inconnues"} · score partiel` : summary.elapsedHours === 0 ? "La première heure complète est en cours." : "Toutes les heures écoulées sont renseignées."} · mesure expérimentale · après synchronisation de la montre{!importedAt ? " · import en attente" : ""}</p>
    <details className={styles.details}><summary>Comment une heure est-elle validée ?</summary><p>100 pas ou 1 minute d’activité détectée, même légère, dans la même heure. Une heure ne compte qu’une fois. Le sommeil est exclu ; une donnée absente reste inconnue. Le suivi continue toute la journée.</p><p>Seuils expérimentaux à vérifier avec ta montre. Une courte série de pompes peut passer inaperçue ; un pic cardiaque seul ne valide pas l’heure.</p></details>
  </section>;
}
