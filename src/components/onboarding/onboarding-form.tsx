"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, Plus, Sparkles, Trash2, Watch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMotionUpdate } from "@/components/motion/use-motion-update";
import { useRef, useState } from "react";

import { SomaLogo } from "@/components/soma-logo";
import { healthyHabitCatalog, type HabitCategory } from "@/domain/lab/journal";
import { goalLabels, type CustomHabitInput, type OnboardingInput } from "@/domain/profile";

const steps = ["Profile", "Goal", "Habits", "Sleep", "Health Data"];

const localizedGoalLabels: Record<keyof typeof goalLabels, string> = {
  build_muscle: "Build muscle",
  improve_endurance: "Improve endurance",
  improve_cardio: "Improve cardio fitness",
  general_fitness: "General fitness",
  maintain_health: "Maintain health",
  other: "Other goal",
};

const categoryLabels: Record<HabitCategory, { title: string; subtitle: string; defaultEmoji: string }> = {
  sleep: { title: "Sleep & Recovery", subtitle: "Consistency and night hygiene", defaultEmoji: "🌙" },
  nutrition: { title: "Nutrition & Fuel", subtitle: "Metabolic stability and hydration", defaultEmoji: "🥗" },
  activity: { title: "Movement & Training", subtitle: "Cardio, strength, and mobility", defaultEmoji: "⚡" },
};

type OnboardingDraft = Omit<OnboardingInput, "heightCm" | "weightKg"> & {
  heightCm: number | "";
  weightKg: number | "";
  selectedHabits: string[];
  customHabits: CustomHabitInput[];
};

const defaultForm: OnboardingDraft = {
  displayName: "",
  dateOfBirth: "",
  heightCm: "",
  weightKg: "",
  sexForHealthCalculations: "prefer_not_to_say",
  primaryGoal: "build_muscle",
  secondaryGoal: null,
  baseSleepTargetMinutes: 510,
  usualWakeTime: "07:00",
  importRange: "all_history",
  timezone: "UTC",
  selectedHabits: healthyHabitCatalog.filter((h) => h.defaultSelected).map((h) => h.name),
  customHabits: [],
};

function createInitialForm(initialDisplayName: string): OnboardingDraft {
  return {
    ...defaultForm,
    displayName: initialDisplayName,
  };
}

export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins === 0 ? "00m" : `${String(mins).padStart(2, "0")}m`}`;
}

export const sleepTicks = [
  { minutes: 300, label: "5h" },
  { minutes: 360, label: "6h" },
  { minutes: 420, label: "7h" },
  { minutes: 480, label: "8h" },
  { minutes: 540, label: "9h" },
  { minutes: 600, label: "10h" },
  { minutes: 660, label: "11h" },
];

export function OnboardingForm({
  initialDisplayName,
  initialStep = 0,
}: {
  initialDisplayName: string;
  initialStep?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [form, setForm] = useState<OnboardingDraft>(() => createInitialForm(initialDisplayName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useMotionUpdate(formRef, step);

  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitCategory, setNewHabitCategory] = useState<HabitCategory>("sleep");

  function update<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleHabit(habitName: string) {
    setForm((current) => {
      const exists = current.selectedHabits.includes(habitName);
      return {
        ...current,
        selectedHabits: exists
          ? current.selectedHabits.filter((h) => h !== habitName)
          : [...current.selectedHabits, habitName],
      };
    });
  }

  function addCustomHabit(event: React.MouseEvent) {
    event.preventDefault();
    const trimmed = newHabitName.trim();
    if (!trimmed) return;

    const emoji = categoryLabels[newHabitCategory].defaultEmoji;
    const newHabit: CustomHabitInput = {
      name: trimmed,
      category: newHabitCategory,
      emoji,
    };

    setForm((current) => ({
      ...current,
      customHabits: [...current.customHabits, newHabit],
      selectedHabits: current.selectedHabits.includes(trimmed)
        ? current.selectedHabits
        : [...current.selectedHabits, trimmed],
    }));

    setNewHabitName("");
  }

  function removeCustomHabit(habitName: string, event: React.MouseEvent) {
    event.stopPropagation();
    setForm((current) => ({
      ...current,
      customHabits: current.customHabits.filter((h) => h.name !== habitName),
      selectedHabits: current.selectedHabits.filter((h) => h !== habitName),
    }));
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
    const sleepStepValid = step !== 3 || Boolean(/^([01]\d|2[0-3]):[0-5]\d$/.test(form.usualWakeTime));
    if (!currentStepValid || !sleepStepValid || !formRef.current?.reportValidity()) {
      setError(step === 0 ? "Please check your name, date of birth, height, and weight." : "Please enter a valid wake time.");
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
        setError("Please check your name, date of birth, height, and weight.");
        setSaving(false);
        return;
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || form.timezone;
      const input: OnboardingInput = {
        ...form,
        heightCm: form.heightCm,
        weightKg: form.weightKg,
        timezone,
        selectedHabits: form.selectedHabits,
        customHabits: form.customHabits,
      };
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to save your profile.");

      if (connectHealth) {
        window.location.assign(new URL("/api/health/google/connect?source=onboarding", window.location.origin).toString());
        return;
      }

      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save your profile.");
      setSaving(false);
    }
  }

  const sleepMin = 300; // 5h00
  const sleepMax = 660; // 11h00
  const sleepPercent = Math.round(((form.baseSleepTargetMinutes - sleepMin) / (sleepMax - sleepMin)) * 100);
  const toleranceLow = formatSleepDuration(Math.max(sleepMin, form.baseSleepTargetMinutes - 10));
  const toleranceHigh = formatSleepDuration(Math.min(sleepMax, form.baseSleepTargetMinutes + 10));

  return (
    <div className="onboarding-shell">
      <aside className="onboarding-aside">
        <Link className="brand brand--auth" href="/" aria-label="Soma Home">
          <SomaLogo />
        </Link>
        <div className="onboarding-aside__intro">
          <h1>Let&apos;s start with you.</h1>
          <p>A few personal benchmarks to establish your baseline.</p>
        </div>
        <ol className="onboarding-steps" aria-label="Onboarding steps">
          {steps.map((label, index) => (
            <li className={index === step ? "is-current" : index < step ? "is-done" : ""} aria-current={index === step ? "step" : undefined} key={label}>
              <span className="onboarding-step__index" aria-hidden="true">{index < step ? <Check size={15} /> : index + 1}</span>
              <span className="onboarding-step__label">{label}</span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="onboarding-main" id="main-page-content">
        <div className="onboarding-progress" role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}>
          <span style={{ transform: `scaleX(${(step + 1) / steps.length})` }} />
        </div>
        <form ref={formRef} className="onboarding-card" onSubmit={(event) => { event.preventDefault(); if (step < steps.length - 1) continueToNextStep(); }}>
          {step === 0 && (
            <fieldset>
              <legend tabIndex={-1}>About you</legend>
              <p className="form-intro">This information is only used for your personal health calculations.</p>
              <div className="form-grid">
                <label className="field field--wide">Name or pseudonym<input required maxLength={80} autoComplete="name" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
                <label className="field">Date of birth<input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
                <label className="field">Sex for health calculations (optional)<select value={form.sexForHealthCalculations} onChange={(event) => update("sexForHealthCalculations", event.target.value as OnboardingInput["sexForHealthCalculations"])}><option value="prefer_not_to_say">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option></select></label>
                <label className="field">Height (cm)<input required min="50" max="260" inputMode="decimal" type="number" value={form.heightCm} onChange={(event) => update("heightCm", event.target.value === "" ? "" : Number(event.target.value))} /></label>
                <label className="field">Weight (kg)<input required min="20" max="400" inputMode="decimal" step="0.1" type="number" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value === "" ? "" : Number(event.target.value))} /></label>
              </div>
            </fieldset>
          )}
          {step === 1 && (
            <fieldset>
              <legend tabIndex={-1}>What is your primary goal?</legend>
              <p className="form-intro">Your goal adjusts the benchmarks suggested by Soma, not the effort already completed.</p>
              <div className="choice-grid">
                {Object.entries(localizedGoalLabels).map(([value, label]) => (
                  <label className={form.primaryGoal === value ? "choice-card is-selected" : "choice-card"} key={value}>
                    <input type="radio" name="primaryGoal" value={value} checked={form.primaryGoal === value} onChange={() => update("primaryGoal", value as OnboardingInput["primaryGoal"])} />
                    <span><strong>{label}</strong><small>Primary goal</small></span>
                    {form.primaryGoal === value && <Check size={18} aria-hidden="true" />}
                  </label>
                ))}
              </div>
              <label className="field field--secondary">Secondary goal (optional)<select value={form.secondaryGoal ?? ""} onChange={(event) => update("secondaryGoal", event.target.value ? event.target.value as OnboardingInput["primaryGoal"] : null)}><option value="">No secondary goal</option>{Object.entries(localizedGoalLabels).filter(([value]) => value !== form.primaryGoal).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset>
              <legend tabIndex={-1}>Your health habits</legend>
              <p className="form-intro">Select helpful benchmarks for your daily journal. You can edit them anytime.</p>

              {(["sleep", "nutrition", "activity"] as const).map((cat) => {
                const catalogItems = healthyHabitCatalog.filter((item) => item.category === cat);
                const customItems = form.customHabits.filter((item) => item.category === cat);
                const meta = categoryLabels[cat];

                return (
                  <div className="habits-theme-group" key={cat}>
                    <div className="habits-theme-header">
                      <h2 className="habits-theme-title">{meta.title}</h2>
                      <span className="habits-theme-count">· {meta.subtitle}</span>
                    </div>

                    <div className="habits-grid" role="group" aria-label={meta.title}>
                      {catalogItems.map((item) => {
                        const isSelected = form.selectedHabits.includes(item.name);
                        return (
                          <label
                            className={`habit-card ${isSelected ? "is-selected" : ""}`}
                            key={item.id}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleHabit(item.name)}
                              aria-label={item.name}
                            />
                            <span className="habit-card__emoji" aria-hidden="true">{item.emoji}</span>
                            <span className="habit-card__content">
                              <span className="habit-card__title">{item.name}</span>
                              <span className="habit-card__desc">{item.description}</span>
                            </span>
                          </label>
                        );
                      })}

                      {customItems.map((item) => {
                        const isSelected = form.selectedHabits.includes(item.name);
                        return (
                          <div
                            className={`habit-card ${isSelected ? "is-selected" : ""}`}
                            key={item.name}
                            onClick={() => toggleHabit(item.name)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleHabit(item.name); } }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleHabit(item.name)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={item.name}
                            />
                            <span className="habit-card__emoji" aria-hidden="true">{item.emoji ?? "✨"}</span>
                            <span className="habit-card__content">
                              <span className="habit-card__title">{item.name}</span>
                              <span className="habit-card__badge">Custom</span>
                            </span>
                            <button
                              type="button"
                              className="habit-card__remove"
                              onClick={(e) => removeCustomHabit(item.name, e)}
                              aria-label={`Remove habit ${item.name}`}
                              title="Remove"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="habit-custom-creator">
                <span className="habit-custom-creator-title">Add a custom habit</span>
                <div className="habit-custom-row">
                  <input
                    type="text"
                    className="habit-custom-input"
                    placeholder="e.g. Meditation 10 min, No screens after 10 PM…"
                    value={newHabitName}
                    maxLength={80}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomHabit(e as unknown as React.MouseEvent); } }}
                    aria-label="Custom habit name"
                  />
                  <select
                    className="habit-custom-select"
                    value={newHabitCategory}
                    onChange={(e) => setNewHabitCategory(e.target.value as HabitCategory)}
                    aria-label="Habit category"
                  >
                    <option value="sleep">Sleep</option>
                    <option value="nutrition">Nutrition</option>
                    <option value="activity">Activity</option>
                  </select>
                  <button
                    type="button"
                    className="secondary-button habit-custom-add-btn"
                    onClick={addCustomHabit}
                    disabled={!newHabitName.trim()}
                  >
                    <Plus size={15} aria-hidden="true" /> Add
                  </button>
                </div>
              </div>
            </fieldset>
          )}
          {step === 3 && (
            <fieldset>
              <legend tabIndex={-1}>Set your sleep baseline</legend>
              <p className="form-intro">Your sleep target remains consistent across weekdays, weekends, and vacations.</p>

              <div className="sleep-slider-control">
                <div className="sleep-slider-header">
                  <div className="sleep-slider-labels">
                    <span className="sleep-slider-title">Sleep target</span>
                    <small className="sleep-slider-tolerance">
                      Accepted range: {toleranceLow} to {toleranceHigh}
                    </small>
                  </div>
                  <strong className="sleep-slider-value" aria-live="polite">
                    {formatSleepDuration(form.baseSleepTargetMinutes)}
                  </strong>
                </div>

                <div className="sleep-slider-track-wrap">
                  <div className="sleep-slider-rail">
                    <div className="sleep-slider-fill" style={{ width: `${sleepPercent}%` }} />
                  </div>
                  <input
                    type="range"
                    min={sleepMin}
                    max={sleepMax}
                    step={15}
                    value={form.baseSleepTargetMinutes}
                    onChange={(event) => update("baseSleepTargetMinutes", Number(event.target.value))}
                    aria-label="Sleep target"
                    aria-valuemin={sleepMin}
                    aria-valuemax={sleepMax}
                    aria-valuenow={form.baseSleepTargetMinutes}
                    aria-valuetext={formatSleepDuration(form.baseSleepTargetMinutes)}
                    className="sleep-slider-input"
                  />
                  <div className="sleep-slider-ticks" aria-hidden="true">
                    {sleepTicks.map((tick) => {
                      const tickPercent = ((tick.minutes - sleepMin) / (sleepMax - sleepMin)) * 100;
                      const isActive = Math.abs(tick.minutes - form.baseSleepTargetMinutes) < 8;
                      return (
                        <div
                          key={tick.minutes}
                          className={`sleep-slider-tick ${isActive ? "is-active" : ""}`}
                          style={{ left: `${tickPercent}%` }}
                        >
                          <span className="sleep-slider-tick-mark" />
                          <span className="sleep-slider-tick-label">{tick.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label className="field field--wake">Usual wake time<input type="time" required value={form.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /><small>This time anchors your first bedtime recommendation.</small></label>
            </fieldset>
          )}
          {step === 4 && (
            <fieldset>
              <legend tabIndex={-1}>Connect your health data</legend>
              <p className="form-intro">Soma can import your sleep, activity, and health records. If Fitbit is linked to Google Health, those records can also be used. The import starts with the last 90 days; older history follows in the background.</p>

              <div className="import-choices">
                <label className={form.importRange === "90_days" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "90_days"} onChange={() => update("importRange", "90_days")} /><span><strong>Last 90 days</strong><small>Faster initial import, sufficient to establish useful benchmarks.</small></span></label>
                <label className={form.importRange === "all_history" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "all_history"} onChange={() => update("importRange", "all_history")} /><span><strong>Full available history</strong><small>Recent data appears first; older history follows in the background.</small></span></label>
              </div>

              <div className="consent-preview" role="note">
                <strong>You will review permissions on Google next.</strong>
                <p>Soma requests read-only access for sleep, activity, and health data. You can decline individual permissions, continue without connecting Google Health, or disconnect anytime.</p>
              </div>

              {/* Welcoming Card for users without a connected watch */}
              <div className="no-watch-welcoming-card" role="region" aria-label="No smartwatch option">
                <div className="no-watch-welcoming-card__header">
                  <Watch className="no-watch-welcoming-card__icon" size={22} aria-hidden="true" />
                  <div className="no-watch-welcoming-card__body">
                    <strong>No connected watch? You can start using your daily journal and meal tracking today.</strong>
                    <p>Soma works smoothly as a personal lab: track your meals, nutrition scores, and daily habits with zero hardware required.</p>
                  </div>
                </div>
                <div className="no-watch-welcoming-card__action">
                  <button
                    className="no-watch-button"
                    type="button"
                    onClick={() => void finish(false)}
                    disabled={saving}
                  >
                    {saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                    <span>Continue without connecting</span>
                  </button>
                </div>
              </div>
            </fieldset>
          )}

          {error && <p className="form-error soma-motion-state" role="alert" aria-live="assertive">{error}</p>}
          <div className="form-navigation">
            <button className="secondary-button" type="button" onClick={() => goToStep(Math.max(0, step - 1))} disabled={step === 0 || saving}><ArrowLeft size={17} aria-hidden="true" /> Back</button>
            {step < steps.length - 1 ? (
              <button className="primary-button" type="button" onClick={continueToNextStep}>Continue <ArrowRight size={17} aria-hidden="true" /></button>
            ) : (
              <div className="onboarding-finish-actions">
                <button className="text-link" type="button" onClick={() => void finish(false)} disabled={saving}>Continue without connecting</button>
                <button className="primary-button" type="button" onClick={() => void finish(true)} disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}{saving ? "Saving…" : "Save and connect Google Health"}</button>
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
