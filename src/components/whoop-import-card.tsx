"use client";

import { Check, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

type ImportResult = {
  error?: string;
  total?: number;
  analysis?: { days?: number };
};

export function WhoopImportCard() {
  const [records, setRecords] = useState<unknown[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "ready" | "importing" | "complete" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function selectFile(file: File | undefined) {
    setRecords(null);
    setFileName(file?.name ?? null);
    setProgress(0);
    setMessage(null);
    setState("idle");
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || !parsed.length || parsed.length > 10_000) throw new Error("Choose a complete Soma-formatted WHOOP JSON file.");
      if (parsed.some((record) => typeof record !== "object" || record === null || (record as { provider?: unknown }).provider !== "whoop_export")) {
        throw new Error("This file is not a Soma-formatted WHOOP export.");
      }
      setRecords(parsed);
      setState("ready");
      setMessage(`${parsed.length.toLocaleString("en-US")} records ready.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The WHOOP file could not be read.");
    }
  }

  async function importRecords() {
    if (!records || state === "importing") return;
    setState("importing");
    setProgress(0);
    setMessage("Importing WHOOP history…");
    try {
      let finalResult: ImportResult = {};
      for (let index = 0; index < records.length; index += 500) {
        const end = Math.min(index + 500, records.length);
        const finalize = end === records.length;
        const response = await fetch("/api/health/import/whoop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: records.slice(index, end), finalize, expectedTotal: records.length }),
        });
        finalResult = await response.json() as ImportResult;
        if (!response.ok) throw new Error(finalResult.error ?? "WHOOP history could not be imported.");
        setProgress(Math.round(end / records.length * 100));
      }
      setState("complete");
      setMessage(`${finalResult.total?.toLocaleString("en-US") ?? records.length.toLocaleString("en-US")} records imported · ${finalResult.analysis?.days ?? 0} days refreshed.`);
    } catch (error) {
      setState("error");
      setMessage(`${error instanceof Error ? error.message : "WHOOP history could not be imported."} You can safely retry.`);
    }
  }

  return <article className="whoop-import-card">
    <Upload aria-hidden="true" />
    <div>
      <strong>Import WHOOP history</strong>
      <p>Add sleep, physiology, workouts, and heart-rate zones from a Soma-formatted WHOOP JSON export.</p>
      {message && <p className={`whoop-import-card__status whoop-import-card__status--${state}`} role={state === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}
      {state === "importing" && <progress max="100" value={progress} aria-label={`WHOOP import ${progress}%`} />}
    </div>
    <div className="whoop-import-card__actions">
      <label className="whoop-import-card__picker">
        <span>{fileName ?? "Choose JSON"}</span>
        <input type="file" accept="application/json,.json" disabled={state === "importing"} onChange={(event) => void selectFile(event.target.files?.[0])} />
      </label>
      <button type="button" disabled={!records || state === "importing" || state === "complete"} onClick={() => void importRecords()}>
        {state === "importing" ? <LoaderCircle className="spin" /> : state === "complete" ? <Check /> : <Upload />}
        {state === "importing" ? `${progress}%` : state === "complete" ? "Imported" : "Import"}
      </button>
    </div>
  </article>;
}
