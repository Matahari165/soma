"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { SomaLogo } from "@/components/soma-logo";
import { goalLabels, type OnboardingInput } from "@/domain/profile";

const steps = ["About you", "Your goal", "Sleep", "Health data"];

type OnboardingDraft = Omit<OnboardingInput, "heightCm" | "weightKg"> & {
  heightCm: number | "";
  weightKg: number | "";
};

const defaultForm: OnboardingDraft = {
  displayName: "",
  dateOfBirth: "",
  heightCm: "",
  weightKg: "",
  sexForHealthCalculations: "prefer_not_to_say",
  primaryGoal: "build_muscle",
  secondaryGoal: null,
  baseSleepTargetMinutes: 480,
  usualWakeTime: "07:00",
  importRange: "90_days",
  timezone: "UTC",
};

function createInitialForm(initialDisplayName: string): OnboardingDraft {
  return {
    ...defaultForm,
    displayName: initialDisplayName,
  };
}

export function OnboardingForm({ initialDisplayName }: { initialDisplayName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingDraft>(() => createInitialForm(initialDisplayName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const sleepHours = useMemo(() => form.baseSleepTargetMinutes / 60, [form.baseSleepTargetMinutes]);

  function update<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function goToStep(nextStep: number) {
    setError(null);
    setStep(nextStep);
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>("legend")?.focus();
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      document.querySelector(".onboarding-main")?.scrollIntoView({ block: "start", behavior });
    });
  }

  function continueToNextStep() {
    const today = new Date().toISOString().slice(0, 10);
    const currentStepValid = step !== 0 || Boolean(
      form.displayName.trim() && form.displayName.length <= 80 &&
      form.dateOfBirth && form.dateOfBirth <= today &&
      typeof form.heightCm === "number" && Number.isFinite(form.heightCm) && form.heightCm >= 50 && form.heightCm <= 260 &&
      typeof form.weightKg === "number" && Number.isFinite(form.weightKg) && form.weightKg >= 20 && form.weightKg <= 400,
    );
    const sleepStepValid = step !== 2 || Boolean(/^([01]\d|2[0-3]):[0-5]\d$/.test(form.usualWakeTime));
    if (!currentStepValid || !sleepStepValid || !formRef.current?.reportValidity()) {
      setError(step === 0 ? "Check your name, date of birth, height, and weight." : "Enter a valid wake time.");
      return;
    }
    goToStep(Math.min(steps.length - 1, step + 1));
  }

  async function finish(connectHealth: boolean) {
    setSaving(true);
    setError(null);

    try {
      if (typeof form.heightCm !== "number" || typeof form.weightKg !== "number") {
        goToStep(0);
        setError("Check your name, date of birth, height, and weight.");
        setSaving(false);
        return;
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || form.timezone;
      const input: OnboardingInput = { ...form, heightCm: form.heightCm, weightKg: form.weightKg, timezone };
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Onboarding could not be saved.");

      if (connectHealth) {
        window.location.assign(new URL("/api/health/google/connect?source=onboarding", window.location.origin).toString());
        return;
      }

      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Onboarding could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-shell">
      <aside className="onboarding-aside">
        <Link className="brand brand--auth" href="/" aria-label="Soma home">
          <SomaLogo />
        </Link>
        <div>
          <h1>Start with you.</h1>
          <p>A few details shape your first personal baseline.</p>
        </div>
        <ol className="onboarding-steps">
          {steps.map((label, index) => (
            <li className={index === step ? "is-current" : index < step ? "is-done" : ""} key={label}>
              <span>{index < step ? <Check size={15} /> : index + 1}</span>{label}
            </li>
          ))}
        </ol>
      </aside>

      <main className="onboarding-main" id="main-page-content">
        <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <form ref={formRef} className="onboarding-card" onSubmit={(event) => { event.preventDefault(); if (step < steps.length - 1) continueToNextStep(); }}>
          <span className="eyebrow">Step {step + 1} of {steps.length}</span>
          {step === 0 && (
            <fieldset>
              <legend tabIndex={-1}>Tell us about you</legend>
              <p className="form-intro">Soma uses these values only for your own health calculations.</p>
              <div className="form-grid">
                <label className="field field--wide">Name<input required maxLength={80} autoComplete="name" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
                <label className="field">Date of birth<input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
                <label className="field">Sex for health calculations<select value={form.sexForHealthCalculations} onChange={(event) => update("sexForHealthCalculations", event.target.value as OnboardingInput["sexForHealthCalculations"])}><option value="prefer_not_to_say">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option></select></label>
                <label className="field">Height (cm)<input required min="50" max="260" inputMode="decimal" type="number" value={form.heightCm} onChange={(event) => update("heightCm", event.target.value === "" ? "" : Number(event.target.value))} /></label>
                <label className="field">Weight (kg)<input required min="20" max="400" inputMode="decimal" step="0.1" type="number" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value === "" ? "" : Number(event.target.value))} /></label>
              </div>
            </fieldset>
          )}
          {step === 1 && (
            <fieldset>
              <legend tabIndex={-1}>What are you working toward?</legend>
              <p className="form-intro">Your goal changes the target Soma recommends, not the effort you have already completed.</p>
              <div className="choice-grid">
                {Object.entries(goalLabels).map(([value, label]) => (
                  <label className={form.primaryGoal === value ? "choice-card is-selected" : "choice-card"} key={value}>
                    <input type="radio" name="primaryGoal" value={value} checked={form.primaryGoal === value} onChange={() => update("primaryGoal", value as OnboardingInput["primaryGoal"])} />
                    <span><strong>{label}</strong><small>Primary goal</small></span>
                    {form.primaryGoal === value && <Check size={18} />}
                  </label>
                ))}
              </div>
              <label className="field field--secondary">Optional secondary goal<select value={form.secondaryGoal ?? ""} onChange={(event) => update("secondaryGoal", event.target.value ? event.target.value as OnboardingInput["primaryGoal"] : null)}><option value="">No secondary goal</option>{Object.entries(goalLabels).filter(([value]) => value !== form.primaryGoal).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset>
              <legend tabIndex={-1}>Set your sleep foundation</legend>
              <p className="form-intro">Eight hours is the starting point. Soma may recommend slightly more when sleep debt or effort increases your need.</p>
              <div className="sleep-target-control">
                <span>Base sleep target</span>
                <strong>{sleepHours.toFixed(sleepHours % 1 ? 1 : 0)} hours</strong>
                <input aria-label="Base sleep target" aria-valuetext={`${sleepHours.toFixed(sleepHours % 1 ? 1 : 0)} hours`} type="range" min="360" max="600" step="15" value={form.baseSleepTargetMinutes} onChange={(event) => update("baseSleepTargetMinutes", Number(event.target.value))} />
                <div><small>6h</small><small>10h</small></div>
              </div>
              <label className="field field--wake">Usual wake time<input type="time" required value={form.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /><small>This anchors your first bedtime recommendation.</small></label>
            </fieldset>
          )}
          {step === 3 && (
            <fieldset>
              <legend tabIndex={-1}>Connect Fitbit through Google Health</legend>
              <p className="form-intro">After Fitbit syncs your bracelet, Google Health makes the authorized data available to Soma. Soma imports the latest 90 days first; a full-history import then continues in the background.</p>
              <div className="import-choices">
                <label className={form.importRange === "90_days" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "90_days"} onChange={() => update("importRange", "90_days")} /><span><strong>Last 90 days</strong><small>Faster first import and enough data for useful baselines.</small></span></label>
                <label className={form.importRange === "all_history" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "all_history"} onChange={() => update("importRange", "all_history")} /><span><strong>All available history</strong><small>Recent data appears first; older records import in the background.</small></span></label>
              </div>
              <div className="consent-preview"><strong>You will review access on Google next.</strong><p>Soma requests read-only access to sleep, activity, and health measurements. You can decline scopes, finish without connecting, or disconnect later.</p></div>
            </fieldset>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-navigation">
            <button className="secondary-button" type="button" onClick={() => goToStep(Math.max(0, step - 1))} disabled={step === 0 || saving}><ArrowLeft size={17} /> Back</button>
            {step < steps.length - 1 ? (
              <button className="primary-button" type="button" onClick={continueToNextStep}>Continue <ArrowRight size={17} /></button>
            ) : (
              <div className="onboarding-finish-actions">
                <button className="text-link" type="button" onClick={() => void finish(false)} disabled={saving}>Finish without connecting</button>
                <button className="primary-button" type="button" onClick={() => void finish(true)} disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{saving ? "Saving…" : "Save and connect Google Health"}</button>
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
