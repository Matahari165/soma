"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Soma route error", error);
  }, [error]);

  return (
    <section className="system-state system-state--error" id="main-page-content" role="alert">
      <AlertCircle size={24} aria-hidden="true" />
      <span className="eyebrow">Data unavailable</span>
      <h1>This view could not load</h1>
      <p>Your saved data was not changed.</p>
      <button className="secondary-button" type="button" onClick={() => retry()}>
        <RotateCcw size={16} aria-hidden="true" />Try again
      </button>
    </section>
  );
}
