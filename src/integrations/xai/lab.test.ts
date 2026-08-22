import { describe, expect, it } from "vitest";

import { labNarrativeSchema } from "./lab";

describe("Grok Personal Lab output", () => {
  it("accepts a concise grounded summary", () => {
    const result = labNarrativeSchema.parse({ headline: "Les semaines plus actives vont avec une FC au repos plus basse.", summary: "Effet observé: -2 bpm.", highlights: ["30 semaines comparées"] });
    expect(result.highlights).toHaveLength(1);
  });
});
