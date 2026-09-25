import { describe, expect, it } from "vitest";

import { recoveryTokenFromRedirect } from "./recovery-link";

describe("recovery redirect", () => {
  const origin = "https://soma.example";

  it("accepts an implicit session from the localhost fallback", () => {
    expect(recoveryTokenFromRedirect("http://localhost:3000/#access_token=synthetic-token&type=signup", origin)).toBe("synthetic-token");
    expect(recoveryTokenFromRedirect("http://127.0.0.1:3000/#access_token=synthetic-token", origin)).toBe("synthetic-token");
  });

  it("accepts the configured Soma origin and rejects unrelated destinations", () => {
    expect(recoveryTokenFromRedirect(`${origin}/login?reset=1#access_token=synthetic-token`, origin)).toBe("synthetic-token");
    expect(recoveryTokenFromRedirect("https://unrelated.example/#access_token=synthetic-token", origin)).toBeNull();
    expect(recoveryTokenFromRedirect("http://localhost.evil.example/#access_token=synthetic-token", origin)).toBeNull();
    expect(recoveryTokenFromRedirect("http://localhost:3000/?token=synthetic-token", origin)).toBeNull();
  });
});
