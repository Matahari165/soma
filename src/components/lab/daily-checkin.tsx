"use client";

import { Check, LoaderCircle, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DailyCheckin } from "@/services/personal-lab";

type RatingKey = "energy" | "focus" | "stress" | "mood";
type FormState = {
  energy: number | null;
  focus: number | null;
  stress: number | null;
  mood: number | null;
  caffeine: number;
  alcohol: number;
  lateMeal: boolean;
  illness: boolean;
  deepWorkMinutesOverride: number | null;
};

const ratingLabels: Record<RatingKey, string> = { energy: "Energy", focus: "Focus", stress: "Stress", mood: "Mood" };

function initialState(checkin: DailyCheckin | null): FormState {
  return {
    energy: checkin?.energy ?? null,
    focus: checkin?.focus ?? null,
    stress: checkin?.stress ?? null,
    mood: checkin?.mood ?? null,
    caffeine: checkin?.caffeine_servings ?? 0,
    alcohol: checkin?.alcohol_servings ?? 0,
    lateMeal: checkin?.late_meal ?? false,
    illness: checkin?.illness ?? false,
    deepWorkMinutesOverride: checkin?.deep_work_minutes_override ?? null,
  };
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="checkin-counter"><span>{label}</span><div><button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Decrease ${label}`}><Minus size={14} /></button><strong>{value}</strong><button type="button" onClick={() => onChange(Math.min(20, value + 1))} aria-label={`Increase ${label}`}><Plus size={14} /></button></div></div>;
}

export function DailyCheckinForm({ checkin, date, calendarDeepWorkMinutes }: { checkin: DailyCheckin | null; date: string; calendarDeepWorkMinutes: number | null }) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialState(checkin));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(checkin));
  const [error, setError] = useState<string | null>(null);

  function setRating(key: RatingKey, value: number) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/lab/check-in", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkinDate: date,
          energy: form.energy,
          focus: form.focus,
          stress: form.stress,
          mood: form.mood,
          soreness: checkin?.soreness ?? null,
          caffeineServings: form.caffeine,
          alcoholServings: form.alcohol,
          lateMeal: form.lateMeal,
          illness: form.illness,
          deepWorkMinutesOverride: form.deepWorkMinutesOverride,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your check-in could not be saved.");
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your check-in could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const calendarHours = calendarDeepWorkMinutes === null ? "No calendar total" : `${Math.floor(calendarDeepWorkMinutes / 60)}h ${calendarDeepWorkMinutes % 60}m from Calendar`;
  return <section className="checkin-card" aria-labelledby="checkin-title">
    <header><div><span className="eyebrow">30-second check-in</span><h2 id="checkin-title">Add today’s context</h2></div><span className={saved ? "checkin-state checkin-state--saved" : "checkin-state"}>{saved ? <><Check size={14} />Saved</> : "Not saved"}</span></header>
    <div className="rating-grid">
      {(Object.keys(ratingLabels) as RatingKey[]).map((key) => <fieldset key={key}><legend>{ratingLabels[key]}</legend><div role="group" aria-label={`${ratingLabels[key]} from 1 to 5`}>{[1, 2, 3, 4, 5].map((value) => <button className={form[key] === value ? "is-selected" : ""} type="button" aria-pressed={form[key] === value} onClick={() => setRating(key, value)} key={value}>{value}</button>)}</div></fieldset>)}
    </div>
    <div className="checkin-context">
      <Counter label="Caffeine" value={form.caffeine} onChange={(value) => { setForm((current) => ({ ...current, caffeine: value })); setSaved(false); }} />
      <Counter label="Alcohol" value={form.alcohol} onChange={(value) => { setForm((current) => ({ ...current, alcohol: value })); setSaved(false); }} />
      <label className="checkin-toggle"><input type="checkbox" checked={form.lateMeal} onChange={(event) => { setForm((current) => ({ ...current, lateMeal: event.target.checked })); setSaved(false); }} /><span>Late meal</span></label>
      <label className="checkin-toggle"><input type="checkbox" checked={form.illness} onChange={(event) => { setForm((current) => ({ ...current, illness: event.target.checked })); setSaved(false); }} /><span>Unwell</span></label>
    </div>
    <details className="deep-work-correction"><summary>Deep Work · {calendarHours}</summary><label>Correct today’s total (minutes)<input type="number" min="0" max="1440" placeholder={calendarDeepWorkMinutes === null ? "e.g. 120" : String(calendarDeepWorkMinutes)} value={form.deepWorkMinutesOverride ?? ""} onChange={(event) => { setForm((current) => ({ ...current, deepWorkMinutesOverride: event.target.value === "" ? null : Number(event.target.value) })); setSaved(false); }} /></label><p>Leave empty to use the total from `DW` or `Deep Work` calendar blocks.</p></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button checkin-save" type="button" onClick={() => void save()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} />Saving…</> : saved ? <><Check size={16} />Update check-in</> : "Save today"}</button>
  </section>;
}
