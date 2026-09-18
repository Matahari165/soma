export type CronJobName = "meal-analysis" | "sync" | "archive-health";

export type CronPipelineEnv = {
  SOMA_CRON_TARGET_URL?: string;
  CRON_SECRET?: string;
  [key: string]: unknown;
};

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const CRON_ENDPOINTS: Record<CronJobName, string> = {
  "meal-analysis": "/api/cron/meal-analysis",
  sync: "/api/cron/sync",
  "archive-health": "/api/cron/archive-health",
};

export type JobExecutionResult = {
  job: CronJobName;
  ok: boolean;
  status: number;
  durationMs: number;
  error?: string;
};

export async function dispatchCronEndpoint(
  job: CronJobName,
  env: CronPipelineEnv,
  fetcher: Fetcher = fetch,
  timeoutMs = 55_000,
): Promise<JobExecutionResult> {
  const start = Date.now();
  const targetUrl = env.SOMA_CRON_TARGET_URL?.trim();
  const secret = env.CRON_SECRET?.trim();

  if (!targetUrl || !secret) {
    throw new Error(`SOMA_CRON_TARGET_URL and CRON_SECRET are required to execute ${job}.`);
  }

  const endpoint = CRON_ENDPOINTS[job];
  const url = new URL(endpoint, targetUrl);
  if (url.protocol !== "https:") {
    throw new Error(`SOMA_CRON_TARGET_URL must use HTTPS (refused for ${job}).`);
  }

  try {
    const response = await fetcher(
      new Request(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      }),
    );

    const responseText = await response.text().catch(() => "");
    const durationMs = Date.now() - start;

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Cron ${job} refused redirect with HTTP ${response.status}.`);
    }

    if (!response.ok) {
      const detail = responseText.slice(0, 200).trim();
      throw new Error(`Cron ${job} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
    }

    return { job, ok: true, status: response.status, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    return { job, ok: false, status: 0, durationMs, error: message };
  }
}

export function isArchiveHealthSlot(scheduledTime: number = Date.now()): boolean {
  const date = new Date(scheduledTime);
  return date.getUTCHours() === 3 && date.getUTCMinutes() === 20;
}

export async function runCronPipeline(
  jobs: CronJobName[],
  env: CronPipelineEnv,
  fetcher: Fetcher = fetch,
): Promise<{ success: boolean; results: JobExecutionResult[] }> {
  const outcomes = await Promise.allSettled(
    jobs.map((job) => dispatchCronEndpoint(job, env, fetcher)),
  );

  const results: JobExecutionResult[] = outcomes.map((outcome, index) => {
    if (outcome.status === "fulfilled") return outcome.value;
    return {
      job: jobs[index],
      ok: false,
      status: 0,
      durationMs: 0,
      error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
    };
  });

  const failures = results.filter((r) => !r.ok);
  for (const res of results) {
    if (res.ok) {
      console.info(`[cron:${res.job}] succeeded with HTTP ${res.status} in ${res.durationMs}ms`);
    } else {
      console.error(`[cron:${res.job}] failed after ${res.durationMs}ms: ${res.error}`);
    }
  }

  return { success: failures.length === 0, results };
}
