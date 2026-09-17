import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { PublicHome } from "@/components/public-home";

describe("PublicHome", () => {
  it("explains the real product without exposing fabricated health data", () => {
    const html = renderToStaticMarkup(<PublicHome />);

    expect(html).toContain("Soma");
    expect(html).toContain("Read your");
    expect(html).toContain("own rhythm.");
    expect(html).toContain("Sign in");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).not.toMatch(/demo|sample score|84\/100/i);
  });
});
