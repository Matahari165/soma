import { dispatchCronEndpoint, type CronPipelineEnv, type Fetcher } from "./cron-pipeline";

export type MealAnalysisCronEnv = CronPipelineEnv;

export async function runMealAnalysisCron(env: MealAnalysisCronEnv, fetcher: Fetcher = fetch): Promise<void> {
  const result = await dispatchCronEndpoint("meal-analysis", env, fetcher);
  if (!result.ok) {
    throw new Error(result.error ?? "Scheduled Soma meal analysis failed.");
  }
}

export async function runHealthSyncCron(env: CronPipelineEnv, fetcher: Fetcher = fetch): Promise<void> {
  const result = await dispatchCronEndpoint("sync", env, fetcher);
  if (!result.ok) {
    throw new Error(result.error ?? "Scheduled Soma health sync failed.");
  }
}

export async function runArchiveHealthCron(env: CronPipelineEnv, fetcher: Fetcher = fetch): Promise<void> {
  const result = await dispatchCronEndpoint("archive-health", env, fetcher);
  if (!result.ok) {
    throw new Error(result.error ?? "Scheduled Soma health archival failed.");
  }
}
