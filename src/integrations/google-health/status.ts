export type GoogleHealthNotice = {
  message: string;
  tone: "success" | "error" | "neutral";
};

const notices: Record<string, GoogleHealthNotice> = {
  connected: {
    message: "Google Health is connected. Your initial import has started in the background.",
    tone: "success",
  },
  connected_partial: {
    message: "Google Health is connected with partial access. Available signals are imported; you can grant remaining permissions at any time.",
    tone: "neutral",
  },
  permission_denied: {
    message: "Google Health permission was not granted. Your Soma profile is saved; you can connect whenever you like.",
    tone: "neutral",
  },
  invalid_state: {
    message: "The Google Health connection link has expired or was interrupted. Please reconnect.",
    tone: "error",
  },
  connection_failed: {
    message: "Google Health could not be connected. No health data was imported. Please reconnect.",
    tone: "error",
  },
  unavailable: {
    message: "Google Health is temporarily unavailable. Your Soma profile is saved. Please reconnect in a moment.",
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
    lastError: job?.error_message ?? (Object.keys(job?.cursor?.typeErrors ?? {}).length ? "Some permitted Google Health signals could not be imported." : null),
    retryable: phase === "retrying" || (phase === "failed" && job?.error_code !== "GOOGLE_HEALTH_SYNC_FAILED"),
  };
}
import type { SignalFreshness, SyncPhase, SyncStatus } from "@/domain/health";
