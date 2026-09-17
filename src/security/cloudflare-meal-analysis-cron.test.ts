import { describe, expect, it, vi } from "vitest";
import { runMealAnalysisCron } from "../../cloudflare/meal-analysis-cron";

describe("runMealAnalysisCron", () => {
  it("calls the Vercel meal-analysis endpoint with the cron secret", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response(null, { status: 200 });
    });

    await runMealAnalysisCron(
      {
        SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app",
        CRON_SECRET: "test-secret",
      },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    const request = requests[0];
    expect(request?.url).toBe("https://soma-neon-phi.vercel.app/api/cron/meal-analysis");
    expect(request?.headers.get("authorization")).toBe("Bearer test-secret");
    expect(request?.redirect).toBe("manual");
  });

  it("fails closed when the target or secret is missing", async () => {
    await expect(runMealAnalysisCron({})).rejects.toThrow("SOMA_CRON_TARGET_URL and CRON_SECRET");
  });

  it("surfaces a rejected Vercel response", async () => {
    await expect(
      runMealAnalysisCron(
        { SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app", CRON_SECRET: "test-secret" },
        async () => new Response(null, { status: 401 }),
      ),
    ).rejects.toThrow("HTTP 401");
  });

  it("refuses redirects without following them", async () => {
    await expect(
      runMealAnalysisCron(
        { SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app", CRON_SECRET: "test-secret" },
        async () => new Response(null, { status: 307 }),
      ),
    ).rejects.toThrow("refused redirect");
  });

  it("rejects a non-HTTPS target before sending the secret", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(
      runMealAnalysisCron({ SOMA_CRON_TARGET_URL: "http://soma.example", CRON_SECRET: "test-secret" }, fetcher),
    ).rejects.toThrow("must use HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
