"use client";

import { useEffect, useId, useState } from "react";
import styles from "../settings-console.module.css";

type Reference = { personalBpm: number | null; maximumHeartRate: { bpm: number; source: "personal" | "age_estimate" } | null };

export function HeartRateZoneSettings({ dateOfBirth }: { dateOfBirth: string }) {
  const id = useId();
  const [reference, setReference] = useState<Reference | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings/heart-rate-reference", { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Heart-rate reference could not be loaded."); return response.json() as Promise<Reference>; })
      .then((result) => { if (!controller.signal.aborted) { setReference(result); setValue(result.personalBpm === null ? "" : String(result.personalBpm)); setError(null); } })
      .catch(() => { if (!controller.signal.aborted) setError("Heart-rate reference could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry, dateOfBirth]);
  const personalBpm = value.trim() === "" ? null : Number(value);
  const valid = personalBpm === null || (Number.isInteger(personalBpm) && personalBpm >= 80 && personalBpm <= 250);
  const dirty = reference !== null && personalBpm !== reference.personalBpm;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !dirty || saving) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/settings/heart-rate-reference", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalBpm }) });
      if (!response.ok) throw new Error("Heart-rate reference could not be saved.");
      const result = await response.json() as Reference;
      setReference(result); setValue(result.personalBpm === null ? "" : String(result.personalBpm));
      setMessage("Heart-rate reference saved. Workout zones will be recalculated when you open a workout.");
    } catch { setError("Heart-rate reference could not be saved. Your changes are kept; try again."); }
    finally { setSaving(false); }
  }
  return <form className={styles.heartRateSetting} onSubmit={(event) => void save(event)} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Workout heart-rate zones</h3>
    <p>Soma calculates five zones from your recorded heart rate: Z1 50–60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 90–100% of your maximum heart rate.</p>
    {loading ? <p role="status">Loading heart-rate reference…</p> : reference && <>
      <div className="settings-form"><label htmlFor={`${id}-maximum`}>Personal maximum heart rate (bpm)<input id={`${id}-maximum`} type="number" inputMode="numeric" min={80} max={250} step={1} value={value} disabled={saving} aria-describedby={`${id}-help${!valid ? ` ${id}-invalid` : ""}`} aria-invalid={!valid} onChange={(event) => { setValue(event.target.value); setError(null); setMessage(null); }} /><small id={`${id}-help`}>Optional. Leave empty to estimate from your date of birth. This is your reference maximum, not the highest reading of one workout.</small></label></div>
      {!valid && <p id={`${id}-invalid`} className="form-error" role="alert">Enter a whole number between 80 and 250 bpm.</p>}
      <p>{reference.maximumHeartRate ? `Current reference: ${reference.maximumHeartRate.bpm} bpm · ${reference.maximumHeartRate.source === "personal" ? "personal value" : "estimated from age (208 − 0.7 × age)"}.` : "No reference available. Enter a personal maximum or add an adult date of birth to your profile."}</p>
      <div><button className="secondary-button" type="submit" disabled={!dirty || !valid || saving}>{saving ? "Saving…" : "Save heart-rate reference"}</button></div>
    </>}
    {error && <p className="form-error" role="alert">{error}{!reference && <button className="secondary-button" type="button" onClick={() => { setLoading(true); setError(null); setRetry((count) => count + 1); }}>Retry</button>}</p>}
    {message && <p className="settings-message" role="status">{message}</p>}
  </form>;
}
