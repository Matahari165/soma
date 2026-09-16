import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import { PublicHome } from "@/components/public-home";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("PublicHome", () => {
  it("renders the unified authentic authentication interface without fabricated data", () => {
    const html = renderToStaticMarkup(<PublicHome />);

    expect(html).toContain("Soma");
    expect(html).toContain("Lisez votre");
    expect(html).toContain("propre rythme.");
    expect(html).toContain("Welcome");
    expect(html).toContain("Sign in");
    expect(html).toContain("Create account");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).not.toMatch(/demo|sample score|84\/100/i);
  });
});
