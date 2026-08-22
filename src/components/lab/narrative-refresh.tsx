"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function NarrativeRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch("/api/lab/summary", { method: "POST", signal: controller.signal }).then((response) => {
      if (response.ok) router.refresh();
    }).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, router]);
  return null;
}
