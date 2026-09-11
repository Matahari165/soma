"use client";

import { HealthErrorState } from "@/components/health/health-error-state";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <HealthErrorState route="sleep" reset={reset} />;
}
