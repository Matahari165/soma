import { runMealAnalysisCron, type MealAnalysisCronEnv } from "./meal-analysis-cron";

type ScheduledControllerLike = { cron: string; scheduledTime: number };
type WorkerEnv = MealAnalysisCronEnv & {
  [key: string]: unknown;
};

const worker = {
  fetch() {
    return new Response("Soma runs on Vercel.", { status: 404 });
  },

  async scheduled(_controller: ScheduledControllerLike, env: WorkerEnv) {
    await runMealAnalysisCron(env);
  },
};

export default worker;
