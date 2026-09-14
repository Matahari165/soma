export type GoogleHealthNotice = {
  message: string;
  tone: "success" | "error" | "neutral";
};

const notices: Record<string, GoogleHealthNotice> = {
  connected: {
    message: "Google Health est connecté. Votre premier import a démarré en arrière-plan.",
    tone: "success",
  },
  connected_partial: {
    message: "Google Health est connecté avec un accès partiel. Les signaux disponibles sont importés ; vous pouvez ajouter les autorisations restantes à tout moment.",
    tone: "neutral",
  },
  permission_denied: {
    message: "L’autorisation Google Health n’a pas été accordée. Votre profil Soma est enregistré ; vous pourrez vous connecter quand vous le souhaiterez.",
    tone: "neutral",
  },
  invalid_state: {
    message: "Le lien de connexion Google Health a expiré ou a été interrompu. Recommencez la connexion.",
    tone: "error",
  },
  connection_failed: {
    message: "Google Health n’a pas pu être connecté. Aucune donnée de santé n’a été importée. Recommencez la connexion.",
    tone: "error",
  },
  unavailable: {
    message: "Google Health est temporairement indisponible. Votre profil Soma est enregistré. Recommencez la connexion dans un instant.",
    tone: "error",
  },
};

export function getGoogleHealthNotice(status: string | undefined) {
  return status ? notices[status] ?? null : null;
}

type SyncJobState = {
  id: string;
  status: string;
  progress: number | null;
  error_code?: string | null;
  error_message?: string | null;
  cursor?: { phase?: string; typeErrors?: Record<string, string> } | null;
};

export function syncPhaseFor(job: SyncJobState | null, partialConsent = false): SyncPhase {
  if (!job) return partialConsent ? "partial" : "up_to_date";
  if (job.status === "completed") return partialConsent || Boolean(Object.keys(job.cursor?.typeErrors ?? {}).length) ? "partial" : "up_to_date";
  if (job.status === "running") return job.cursor?.phase === "materializing" ? "materializing" : "fetching";
  if (job.status === "queued") return job.error_code ? "retrying" : "queued";
  if (job.status === "failed" && ["GOOGLE_HEALTH_AUTH_EXPIRED", "GOOGLE_HEALTH_PERMISSION_REVOKED"].includes(job.error_code ?? "")) return "needs_reconnect";
  return "failed";
}

export function toSyncStatus(job: SyncJobState | null, perType: Record<string, SignalFreshness>, partialConsent = false): SyncStatus {
  const phase = syncPhaseFor(job, partialConsent);
  const progress = job?.progress ?? (phase === "up_to_date" || phase === "partial" ? 100 : 0);
  return {
    jobId: job?.id ?? "none",
    phase,
    progress: Math.min(100, Math.max(0, progress)),
    perType,
    lastError: job?.error_message ?? (Object.keys(job?.cursor?.typeErrors ?? {}).length ? "Certains signaux Google Health autorisés n’ont pas pu être importés." : null),
    retryable: phase === "retrying" || (phase === "failed" && job?.error_code !== "GOOGLE_HEALTH_SYNC_FAILED"),
  };
}
import type { SignalFreshness, SyncPhase, SyncStatus } from "@/domain/health";
