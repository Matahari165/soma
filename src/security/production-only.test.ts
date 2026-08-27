import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const proxySource = readFileSync(`${sourceRoot}/middleware.ts`, "utf8");
const vercelConfig = readFileSync(`${sourceRoot}/../vercel.json`, "utf8");

function applicationSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return applicationSources(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

describe("production-only application contract", () => {
  it("keeps the legacy Vercel host redirect-only", () => {
    expect(vercelConfig).toContain('"destination": "https://soma.hthv4f94vw.workers.dev/:path*"');
    expect(vercelConfig).not.toContain('"crons"');
  });

  it("does not ship a fallback account or fabricated user data mode", () => {
    const source = applicationSources(sourceRoot).map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source).not.toMatch(/NEXT_PUBLIC_SOMA_DATA_MODE|demo@soma\.local|\bdemoMode\b|\bgetDataMode\b|mode:\s*["']demo["']/);
    expect(existsSync(`${sourceRoot}/lib/demo-data.ts`)).toBe(false);
  });

  it("keeps the product home and sign-in page reachable when local auth is not configured", () => {
    expect(proxySource).toContain('request.nextUrl.pathname === "/"');
    expect(proxySource.indexOf("if (isPublicPath) return secureResponse(response)")).toBeLessThan(proxySource.indexOf("const hasSessionCookie"));
  });

  it("does not trust an unverified session cookie to bypass the sign-in page", () => {
    const loginPage = readFileSync(`${sourceRoot}/app/login/page.tsx`, "utf8");
    expect(proxySource).not.toContain('hasSessionCookie && request.nextUrl.pathname === "/login"');
    expect(loginPage).toContain("await Promise.all([searchParams, getCurrentUser()])");
    expect(loginPage).toContain('if (user) redirect("/")');
  });

  it("streams the authenticated Lab sections independently from expensive statistics", () => {
    const page = readFileSync(`${sourceRoot}/app/page.tsx`, "utf8");
    expect(page).toContain("createPersonalLabStream");
    expect(page).toContain("<Suspense fallback={<PersonalLabOverviewLoading />}");
    expect(page).toContain("<Suspense fallback={<PersonalLabJournalLoading />}");
    expect(page).toContain("<Suspense fallback={<PersonalLabAnalysisLoading />}");
  });

  it("bounds Google network waits and defers the first Calendar sync", () => {
    const authCallback = readFileSync(`${sourceRoot}/app/auth/callback/route.ts`, "utf8");
    const healthClient = readFileSync(`${sourceRoot}/integrations/google-health/client.ts`, "utf8");
    const calendarClient = readFileSync(`${sourceRoot}/integrations/google-calendar/client.ts`, "utf8");
    const calendarCallback = readFileSync(`${sourceRoot}/app/api/calendar/google/callback/route.ts`, "utf8");
    expect(authCallback).toContain("AbortSignal.timeout(8_000)");
    expect(healthClient).toContain("AbortSignal.timeout(10_000)");
    expect(calendarClient).toContain("AbortSignal.timeout(10_000)");
    expect(calendarCallback).toContain("after(async () =>");
  });

  it("lets secret-authenticated machine routes reach their own authorization checks", () => {
    expect(proxySource).toContain('"/api/health/webhook"');
    expect(proxySource).toContain('"/api/cron/sync"');
    expect(proxySource).toContain('"/api/cron/archive-health"');
    expect(proxySource).toContain("const publicMachineRoute = publicMachinePaths.some");
    expect(proxySource).toContain("...publicMachinePaths");
  });

  it("keeps authenticated server data canonical across Personal Lab and workouts", () => {
    const personalLab = readFileSync(`${sourceRoot}/components/lab/personal-lab.tsx`, "utf8");
    const workouts = readFileSync(`${sourceRoot}/components/workout-studio.tsx`, "utf8");
    expect(personalLab).not.toContain("localStorage");
    expect(workouts).not.toContain("localStorage");
    expect(workouts).not.toContain("ExerciseFigure");
  });
});
