import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { deleteAccountData } from "@/services/account-deletion";
import { completeOnboarding } from "@/services/onboarding";

import { DELETE as deleteAccount } from "./account/route";
import { POST as saveOnboarding } from "./onboarding/route";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/services/account-deletion", () => ({ deleteAccountData: vi.fn() }));
vi.mock("@/services/onboarding", () => ({ completeOnboarding: vi.fn() }));

const user = { id: "user-native", email: "native@example.test", displayName: "Native" };
const onboarding = {
  displayName: "Native",
  dateOfBirth: "1999-09-19",
  heightCm: 178,
  weightKg: 72,
  sexForHealthCalculations: "prefer_not_to_say",
  primaryGoal: "maintain_health",
  secondaryGoal: null,
  baseSleepTargetMinutes: 510,
  usualWakeTime: "07:00",
  importRange: "all_history",
  timezone: "Europe/Zurich",
  selectedHabits: [],
  customHabits: [],
};

describe("native onboarding and account settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
  });

  it("requires a Bearer session", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    const onboardingResponse = await saveOnboarding(new Request("https://soma.example", { method: "POST", body: JSON.stringify(onboarding) }));
    const deletionResponse = await deleteAccount(new Request("https://soma.example", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY SOMA DATA" }) }));
    expect(onboardingResponse.status).toBe(401);
    expect(deletionResponse.status).toBe(401);
  });

  it("validates and saves the native onboarding contract", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue({ ok: true });
    const response = await saveOnboarding(new Request("https://soma.example", { method: "POST", body: JSON.stringify(onboarding) }));
    expect(response.status).toBe(200);
    expect(completeOnboarding).toHaveBeenCalledWith(user.id, onboarding);
  });

  it("rejects incomplete onboarding data before writing", async () => {
    const response = await saveOnboarding(new Request("https://soma.example", { method: "POST", body: JSON.stringify({ displayName: "Native" }) }));
    expect(response.status).toBe(400);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("passes the explicit deletion confirmation to the shared service", async () => {
    vi.mocked(deleteAccountData).mockResolvedValue({ ok: true });
    const response = await deleteAccount(new Request("https://soma.example", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY SOMA DATA" }) }));
    expect(response.status).toBe(200);
    expect(deleteAccountData).toHaveBeenCalledWith(user.id, "DELETE MY SOMA DATA");
  });
});
