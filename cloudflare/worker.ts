import {
  runCronPipeline,
  isArchiveHealthSlot,
  type CronJobName,
  type CronPipelineEnv,
} from "./cron-pipeline";

export type ScheduledControllerLike = { cron: string; scheduledTime: number };
export type WorkerEnv = CronPipelineEnv;

const worker = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    // Public health check for external observability / uptime monitoring
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: "soma-cron", timestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Manual trigger endpoint secured by CRON_SECRET
    if (url.pathname === "/trigger" || url.pathname === "/api/trigger") {
      const authHeader = request.headers.get("Authorization");
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const jobParam = url.searchParams.get("job");
      let jobsToRun: CronJobName[] = ["meal-analysis", "sync", "account-deletion"];
      if (jobParam === "meal-analysis" || jobParam === "sync" || jobParam === "archive-health" || jobParam === "account-deletion") {
        jobsToRun = [jobParam];
      } else if (jobParam === "all") {
        jobsToRun = ["meal-analysis", "sync", "archive-health", "account-deletion"];
      }

      const outcome = await runCronPipeline(jobsToRun, env);
      return new Response(JSON.stringify(outcome), {
        status: outcome.success ? 200 : 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller: ScheduledControllerLike, env: WorkerEnv): Promise<void> {
    const jobs: CronJobName[] = ["meal-analysis", "sync", "account-deletion"];
    if (isArchiveHealthSlot(controller.scheduledTime)) {
      jobs.push("archive-health");
    }

    const { success, results } = await runCronPipeline(jobs, env);
    if (!success) {
      const failedSummary = results
        .filter((r) => !r.ok)
        .map((r) => `${r.job}: ${r.error}`)
        .join("; ");
      throw new Error(`Scheduled Soma cron pipeline failed: [${failedSummary}]`);
    }
  },
};

export default worker;
