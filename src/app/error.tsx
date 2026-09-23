"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

export default function AppError({ error, reset, retry }: { error: Error & { digest?: string }; reset?: () => void; retry?: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error("Soma route error");
  }, [error]);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const recover = reset ?? retry ?? (() => window.location.reload());
  return (
    <section className="system-state system-state--error" id="main-page-content" role="alert" aria-labelledby="app-error-title">
      <AlertCircle size={24} aria-hidden="true" />
      <span className="eyebrow">Data unavailable</span>
      <h1 id="app-error-title" ref={titleRef} tabIndex={-1}>This view could not be loaded</h1>
      <p>Your saved data has not been modified.</p>
      <button className="secondary-button" type="button" onClick={() => recover()}>
        <RotateCcw size={16} aria-hidden="true" />Try again
      </button>
    </section>
  );
}
