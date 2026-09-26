import { describe, expect, it } from "vitest";

import { LatestRequest } from "./latest-request";

describe("latest request guard", () => {
  it("aborts a previous request and marks its result stale", () => {
    const requests = new LatestRequest();
    const oldRequest = requests.start();
    const currentRequest = requests.start();

    expect(oldRequest.signal.aborted).toBe(true);
    expect(oldRequest.isCurrent()).toBe(false);
    expect(currentRequest.signal.aborted).toBe(false);
    expect(currentRequest.isCurrent()).toBe(true);
  });

  it("invalidates results when a selection is closed or the component unmounts", () => {
    const requests = new LatestRequest();
    const request = requests.start();
    requests.cancel();

    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
  });
});
