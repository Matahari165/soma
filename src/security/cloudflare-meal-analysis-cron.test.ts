import { describe, expect, it, vi } from "vitest";
import { runArchiveHealthCron, runHealthSyncCron, runMealAnalysisCron } from "../../cloudflare/meal-analysis-cron";
import { isArchiveHealthSlot, runCronPipeline } from "../../cloudflare/cron-pipeline";
import worker from "../../cloudflare/worker";

describe("Cloudflare Worker Cron Pipeline", () => {
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
        fetcher as unknown as typeof fetch,
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
          (async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
        ),
      ).rejects.toThrow("HTTP 401");
    });

    it("refuses redirects without following them", async () => {
      await expect(
        runMealAnalysisCron(
          { SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app", CRON_SECRET: "test-secret" },
          (async () => new Response(null, { status: 307 })) as unknown as typeof fetch,
        ),
      ).rejects.toThrow("refused redirect");
    });

    it("rejects a non-HTTPS target before sending the secret", async () => {
      const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
      await expect(
        runMealAnalysisCron({ SOMA_CRON_TARGET_URL: "http://soma.example", CRON_SECRET: "test-secret" }, fetcher as unknown as typeof fetch),
      ).rejects.toThrow("must use HTTPS");
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe("runHealthSyncCron", () => {
    it("calls the Vercel sync endpoint with the cron secret", async () => {
      const requests: Request[] = [];
      const fetcher = vi.fn(async (request: Request) => {
        requests.push(request);
        return new Response(JSON.stringify({ automatic: { queued: 1 }, processed: [] }), { status: 200 });
      });

      await runHealthSyncCron(
        {
          SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app",
          CRON_SECRET: "test-secret",
        },
        fetcher as unknown as typeof fetch,
      );

      expect(fetcher).toHaveBeenCalledOnce();
      const request = requests[0];
      expect(request?.url).toBe("https://soma-neon-phi.vercel.app/api/cron/sync");
      expect(request?.headers.get("authorization")).toBe("Bearer test-secret");
      expect(request?.redirect).toBe("manual");
    });

    it("fails closed when the target or secret is missing", async () => {
      await expect(runHealthSyncCron({})).rejects.toThrow("SOMA_CRON_TARGET_URL and CRON_SECRET");
    });

    it("surfaces a rejected Vercel response", async () => {
      await expect(
        runHealthSyncCron(
          { SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app", CRON_SECRET: "test-secret" },
          (async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
        ),
      ).rejects.toThrow("HTTP 500");
    });
  });

  describe("runArchiveHealthCron", () => {
    it("calls the Vercel archive-health endpoint with the cron secret", async () => {
      const requests: Request[] = [];
      const fetcher = vi.fn(async (request: Request) => {
        requests.push(request);
        return new Response(JSON.stringify({ archived: [] }), { status: 200 });
      });

      await runArchiveHealthCron(
        {
          SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app",
          CRON_SECRET: "test-secret",
        },
        fetcher as unknown as typeof fetch,
      );

      expect(fetcher).toHaveBeenCalledOnce();
      const request = requests[0];
      expect(request?.url).toBe("https://soma-neon-phi.vercel.app/api/cron/archive-health");
      expect(request?.headers.get("authorization")).toBe("Bearer test-secret");
    });
  });

  describe("isArchiveHealthSlot", () => {
    it("identifies 03:20 UTC as the archive slot", () => {
      const slotTime = Date.parse("2026-09-18T03:20:00.000Z");
      expect(isArchiveHealthSlot(slotTime)).toBe(true);
    });

    it("rejects non-archive slots", () => {
      expect(isArchiveHealthSlot(Date.parse("2026-09-18T03:19:00.000Z"))).toBe(false);
      expect(isArchiveHealthSlot(Date.parse("2026-09-18T03:21:00.000Z"))).toBe(false);
      expect(isArchiveHealthSlot(Date.parse("2026-09-18T11:30:00.000Z"))).toBe(false);
    });
  });

  describe("runCronPipeline", () => {
    it("executes jobs concurrently and isolates errors", async () => {
      const fetcher = vi.fn(async (request: Request) => {
        if (request.url.includes("/api/cron/meal-analysis")) {
          return new Response(JSON.stringify({ processed: true }), { status: 200 });
        }
        if (request.url.includes("/api/cron/sync")) {
          return new Response(JSON.stringify({ error: "Upstream timeout" }), { status: 504 });
        }
        return new Response(null, { status: 404 });
      });

      const outcome = await runCronPipeline(
        ["meal-analysis", "sync"],
        {
          SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app",
          CRON_SECRET: "test-secret",
        },
        fetcher as unknown as typeof fetch,
      );

      expect(outcome.success).toBe(false);
      expect(outcome.results).toHaveLength(2);
      expect(outcome.results[0]?.job).toBe("meal-analysis");
      expect(outcome.results[0]?.ok).toBe(true);
      expect(outcome.results[1]?.job).toBe("sync");
      expect(outcome.results[1]?.ok).toBe(false);
      expect(outcome.results[1]?.error).toContain("HTTP 504");
    });

    it("succeeds when all jobs succeed", async () => {
      const fetcher = vi.fn(async () => new Response(null, { status: 200 }));

      const outcome = await runCronPipeline(
        ["meal-analysis", "sync"],
        {
          SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app",
          CRON_SECRET: "test-secret",
        },
        fetcher as unknown as typeof fetch,
      );

      expect(outcome.success).toBe(true);
      expect(outcome.results.every((r) => r.ok)).toBe(true);
    });
  });

  describe("worker", () => {
    const env = {
      SOMA_CRON_TARGET_URL: "https://soma-neon-phi.vercel.app",
      CRON_SECRET: "test-secret",
    };

    it("provides public health check on GET / and /health", async () => {
      const rootRes = await worker.fetch(new Request("https://worker.local/"), env);
      expect(rootRes.status).toBe(200);
      const rootData = await rootRes.json() as Record<string, unknown>;
      expect(rootData.status).toBe("ok");
      expect(rootData.service).toBe("soma-cron");

      const healthRes = await worker.fetch(new Request("https://worker.local/health"), env);
      expect(healthRes.status).toBe(200);
    });

    it("rejects unauthenticated manual triggers", async () => {
      const res = await worker.fetch(new Request("https://worker.local/trigger", { method: "POST" }), env);
      expect(res.status).toBe(401);
    });

    it("returns 404 for unknown endpoints", async () => {
      const res = await worker.fetch(new Request("https://worker.local/unknown"), env);
      expect(res.status).toBe(404);
    });

    it("triggers both meal-analysis and sync during scheduled ticks", async () => {
      const requestedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      try {
        await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-09-18T11:30:00.000Z") }, env);
        expect(requestedUrls).toContain("https://soma-neon-phi.vercel.app/api/cron/meal-analysis");
        expect(requestedUrls).toContain("https://soma-neon-phi.vercel.app/api/cron/sync");
        expect(requestedUrls).not.toContain("https://soma-neon-phi.vercel.app/api/cron/archive-health");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("includes archive-health during scheduled 03:20 UTC tick", async () => {
      const requestedUrls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      try {
        await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-09-18T03:20:00.000Z") }, env);
        expect(requestedUrls).toContain("https://soma-neon-phi.vercel.app/api/cron/meal-analysis");
        expect(requestedUrls).toContain("https://soma-neon-phi.vercel.app/api/cron/sync");
        expect(requestedUrls).toContain("https://soma-neon-phi.vercel.app/api/cron/archive-health");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws aggregated error when scheduled execution encounters failure", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/api/cron/sync")) {
          return new Response("Internal error", { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      try {
        await expect(
          worker.scheduled({ cron: "* * * * *", scheduledTime: Date.parse("2026-09-18T11:30:00.000Z") }, env),
        ).rejects.toThrow("Scheduled Soma cron pipeline failed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
