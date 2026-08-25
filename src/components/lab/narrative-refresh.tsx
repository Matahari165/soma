"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function NarrativeRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/lab/summary", { method: "POST", signal: controller.signal });
        if (response.status === 202 && attempts < 16) {
          timer = window.setTimeout(() => void refresh(), 2_000);
          return;
        }
        if (response.ok) router.refresh();
      } catch {
        // A later page visit will retry; the current analysis remains usable.
      }
    };
    void refresh();
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, router]);
  return null;
}
