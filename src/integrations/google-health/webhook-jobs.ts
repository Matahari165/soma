export type WebhookJobCandidate = {
  eventId: string;
  userId: string;
  connectionId: string;
  dataType: string;
  rangeStart: string;
  rangeEnd: string;
};

export type CoalescedWebhookJob = Omit<WebhookJobCandidate, "eventId"> & { eventIds: string[] };

function earlier(first: string, second: string) {
  return new Date(first) <= new Date(second) ? first : second;
}

function later(first: string, second: string) {
  return new Date(first) >= new Date(second) ? first : second;
}

export function coalesceWebhookJobs(candidates: WebhookJobCandidate[]) {
  const groups = new Map<string, CoalescedWebhookJob>();
  for (const candidate of candidates) {
    const key = `${candidate.userId}:${candidate.connectionId}:${candidate.dataType}`;
    const current = groups.get(key);
    if (!current) {
      const { eventId, ...job } = candidate;
      groups.set(key, { ...job, eventIds: [eventId] });
      continue;
    }
    current.eventIds.push(candidate.eventId);
    current.rangeStart = earlier(current.rangeStart, candidate.rangeStart);
    current.rangeEnd = later(current.rangeEnd, candidate.rangeEnd);
  }
  return [...groups.values()];
}

export function mergeWebhookRange(
  existing: { range_start: string | null; range_end: string | null },
  incoming: { rangeStart: string; rangeEnd: string },
) {
  return {
    range_start: existing.range_start ? earlier(existing.range_start, incoming.rangeStart) : incoming.rangeStart,
    range_end: existing.range_end ? later(existing.range_end, incoming.rangeEnd) : incoming.rangeEnd,
  };
}
