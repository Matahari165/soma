import { describe, expect, it } from "vitest";

import { createGetDataCatalogTool } from "./get-data-catalog";

describe("getDataCatalog tool", () => {
  it("is a no-argument discovery tool with a documented health/activity catalog", () => {
    const catalogTool = createGetDataCatalogTool({ userId: "user-1", runId: "run-1" });
    expect(catalogTool.description).toContain("métriques de santé");
    expect(catalogTool.inputSchema.parse({})).toEqual({});
  });
});
