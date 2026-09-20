import { describe, expect, it } from "vitest";

import { exerciseMatchesFilter } from "./activity-history";

describe("activity history filters", () => {
  it("groups imported jogging and trail running under Run", () => {
    expect(exerciseMatchesFilter("JOGGING", "run")).toBe(true);
    expect(exerciseMatchesFilter("TRAIL_RUNNING", "run")).toBe(true);
    expect(exerciseMatchesFilter("BOXING", "run")).toBe(false);
  });

  it("keeps both strength aliases and never hides an unknown type from All", () => {
    expect(exerciseMatchesFilter("WEIGHT_TRAINING", "strength")).toBe(true);
    expect(exerciseMatchesFilter("STRENGTH_TRAINING", "strength")).toBe(true);
    expect(exerciseMatchesFilter("UNKNOWN", "all")).toBe(true);
  });
});
