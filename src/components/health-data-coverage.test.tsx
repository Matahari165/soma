import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HealthDataCoverageIndicator } from "./health-data-coverage";

describe("HealthDataCoverageIndicator", () => {
  it("shows the used and imported day and night counts", () => {
    const markup = renderToStaticMarkup(<HealthDataCoverageIndicator coverage={{
      status: "complete",
      importedDays: 88,
      usedDays: 88,
      importedNights: 83,
      usedNights: 83,
      missingDays: 0,
      missingNights: 0,
      startDate: "2026-05-24",
      endDate: "2026-08-22",
    }} phase="up_to_date" />);

    expect(markup).toContain("Données dans Soma");
    expect(markup).toContain("88 / 88");
    expect(markup).toContain("83 / 83");
    expect(markup).toContain("Complète");
  });
});
