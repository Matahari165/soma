import { beforeEach, describe, expect, it, vi } from "vitest";

import { findUserByAppleSyncToken, getOrCreateAppleSyncToken } from "@/lib/apple-health";
import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/apple-health", () => ({
  findUserByAppleSyncToken: vi.fn(),
  getOrCreateAppleSyncToken: vi.fn(),
}));

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: vi.fn(),
}));

describe("Apple Health Sync API route", () => {
  const upsertMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCloudflareAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        upsert: upsertMock,
      })),
    } as never);
  });

  describe("GET /api/health/apple-sync", () => {
    it("returns the sync token for an authenticated user", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        displayName: "User One",
      });
      vi.mocked(getOrCreateAppleSyncToken).mockResolvedValue("soma_ah_testtoken12345");

      const response = await GET(new Request("https://soma.fit/api/health/apple-sync"));
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.token).toBe("soma_ah_testtoken12345");
      expect(json.endpoint).toContain("/api/health/apple-sync");
    });
  });

  describe("POST /api/health/apple-sync", () => {
    it("imports Apple Health metrics authenticated via Bearer token", async () => {
      vi.mocked(findUserByAppleSyncToken).mockResolvedValue("user-1");
      upsertMock.mockResolvedValue({ error: null });

      const payload = {
        metrics: [
          {
            date: "2026-09-15",
            sleepMinutes: 480,
            deepSleepMinutes: 90,
            remSleepMinutes: 105,
            hrv: 62,
            restingHeartRate: 50,
            steps: 9500,
            activeCalories: 321,
          },
        ],
      };

      const request = new Request("https://soma.fit/api/health/apple-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer soma_ah_testtoken12345",
        },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.importedDays).toBe(1);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: "user-1",
            metric_date: "2026-09-15",
            sleep_minutes: 480,
            hrv_ms: 62,
            active_energy_kcal: 321,
            data_quality: expect.objectContaining({ source: "apple_health", primaryWearable: "Apple Watch" }),
          }),
        ]),
        { onConflict: "user_id,metric_date" },
      );
      expect(upsertMock).toHaveBeenCalledTimes(1);
      const [rows] = upsertMock.mock.calls[0] as [Array<Record<string, unknown>>];
      expect(rows[0]).not.toHaveProperty("active_energy");
    });

    it("rejects unauthorized calls without a token", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const request = new Request("https://soma.fit/api/health/apple-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: [] }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });
});
