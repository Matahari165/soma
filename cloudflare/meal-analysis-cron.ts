export type MealAnalysisCronEnv = {
  SOMA_CRON_TARGET_URL?: string;
  CRON_SECRET?: string;
};

type Fetcher = (input: Request) => Promise<Response>;

export async function runMealAnalysisCron(env: MealAnalysisCronEnv, fetcher: Fetcher = fetch) {
  if (!env.SOMA_CRON_TARGET_URL || !env.CRON_SECRET) {
    throw new Error("SOMA_CRON_TARGET_URL and CRON_SECRET are required for scheduled meal analysis.");
  }

  const url = new URL("/api/cron/meal-analysis", env.SOMA_CRON_TARGET_URL);
  if (url.protocol !== "https:") {
    throw new Error("SOMA_CRON_TARGET_URL must use HTTPS.");
  }
  const response = await fetcher(
    new Request(url, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      redirect: "manual",
    }),
  );

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Scheduled Soma meal analysis refused redirect with HTTP ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(`Scheduled Soma meal analysis failed with HTTP ${response.status}.`);
  }
}
