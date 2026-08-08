import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const proxySource = readFileSync(`${sourceRoot}/proxy.ts`, "utf8");

function applicationSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return applicationSources(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

describe("production-only application contract", () => {
  it("does not ship a fallback account or fabricated user data mode", () => {
    const source = applicationSources(sourceRoot).map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source).not.toMatch(/NEXT_PUBLIC_SOMA_DATA_MODE|demo@soma\.local|\bdemoMode\b|\bgetDataMode\b|mode:\s*["']demo["']/);
    expect(existsSync(`${sourceRoot}/lib/demo-data.ts`)).toBe(false);
  });

  it("keeps the product home and sign-in page reachable when local auth is not configured", () => {
    expect(proxySource).toContain('request.nextUrl.pathname === "/"');
    expect(proxySource.indexOf("if (isPublicPath) return secureResponse(response)")).toBeLessThan(proxySource.indexOf("createServerClient(url, anonKey"));
  });
});
