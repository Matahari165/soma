"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, Plus, Sparkles, Trash2, Watch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { SomaLogo } from "@/components/soma-logo";
import { healthyHabitCatalog, type HabitCategory } from "@/domain/lab/journal";
import { goalLabels, type CustomHabitInput, type OnboardingInput } from "@/domain/profile";

const steps = ["Vous", "Objectif", "Habitudes", "Sommeil", "Données de santé"];

const localizedGoalLabels: Record<keyof typeof goalLabels, string> = {
  build_muscle: "Développer sa masse musculaire",
  improve_endurance: "Améliorer son endurance",
  improve_cardio: "Améliorer son cardio",
  general_fitness: "Améliorer sa forme générale",
  maintain_health: "Préserver sa santé",
  other: "Autre objectif",
};

const categoryLabels: Record<HabitCategory, { title: string; subtitle: string; defaultEmoji: string }> = {
  sleep: { title: "Sommeil & Récupération", subtitle: "Régularité et hygiène nocturne", defaultEmoji: "🌙" },
  nutrition: { title: "Nutrition & Énergie", subtitle: "Stabilité métabolique et hydratation", defaultEmoji: "🥗" },
  activity: { title: "Activité & Mouvement", subtitle: "Cardio, force et mobilité", defaultEmoji: "⚡" },
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
  return `${hours} h ${mins === 0 ? "00" : String(mins).padStart(2, "0")}`;
}

export const sleepTicks = [
  { minutes: 300, label: "5 h" },
  { minutes: 360, label: "6 h" },
  { minutes: 420, label: "7 h" },
  { minutes: 480, label: "8 h" },
  { minutes: 540, label: "9 h" },
  { minutes: 600, label: "10 h" },
  { minutes: 660, label: "11 h" },
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
      setError(step === 0 ? "Vérifiez le nom, la date de naissance, la taille et le poids." : "Saisissez une heure de réveil valide.");
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
        setError("Vérifiez le nom, la date de naissance, la taille et le poids.");
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
      if (!response.ok) throw new Error(result.error ?? "Impossible d’enregistrer votre profil.");

      if (connectHealth) {
        window.location.assign(new URL("/api/health/google/connect?source=onboarding", window.location.origin).toString());
        return;
      }

      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Impossible d’enregistrer votre profil.");
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
        <Link className="brand brand--auth" href="/" aria-label="Accueil Soma">
          <SomaLogo />
        </Link>
        <div className="onboarding-aside__intro">
          <h1>Commençons par vous.</h1>
          <p>Quelques repères pour établir votre base personnelle.</p>
        </div>
        <ol className="onboarding-steps" aria-label="Étapes de configuration">
          {steps.map((label, index) => (
            <li className={index === step ? "is-current" : index < step ? "is-done" : ""} aria-current={index === step ? "step" : undefined} key={label}>
              <span className="onboarding-step__index" aria-hidden="true">{index < step ? <Check size={15} /> : index + 1}</span>
              <span className="onboarding-step__label">{label}</span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="onboarding-main" id="main-page-content">
        <div className="onboarding-progress" role="progressbar" aria-label="Progression de la configuration" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-valuetext={`Étape ${step + 1} sur ${steps.length} : ${steps[step]}`}>
          <span style={{ transform: `scaleX(${(step + 1) / steps.length})` }} />
        </div>
        <form ref={formRef} className="onboarding-card" onSubmit={(event) => { event.preventDefault(); if (step < steps.length - 1) continueToNextStep(); }}>
          {step === 0 && (
            <fieldset>
              <legend tabIndex={-1}>À propos de vous</legend>
              <p className="form-intro">Ces informations servent uniquement à vos calculs de santé personnels.</p>
              <div className="form-grid">
                <label className="field field--wide">Nom<input required maxLength={80} autoComplete="name" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
                <label className="field">Date de naissance<input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
                <label className="field">Sexe pour les calculs de santé (facultatif)<select value={form.sexForHealthCalculations} onChange={(event) => update("sexForHealthCalculations", event.target.value as OnboardingInput["sexForHealthCalculations"])}><option value="prefer_not_to_say">Je préfère ne pas répondre</option><option value="female">Femme</option><option value="male">Homme</option><option value="intersex">Intersexe</option></select></label>
                <label className="field">Taille (cm)<input required min="50" max="260" inputMode="decimal" type="number" value={form.heightCm} onChange={(event) => update("heightCm", event.target.value === "" ? "" : Number(event.target.value))} /></label>
                <label className="field">Poids (kg)<input required min="20" max="400" inputMode="decimal" step="0.1" type="number" value={form.weightKg} onChange={(event) => update("weightKg", event.target.value === "" ? "" : Number(event.target.value))} /></label>
              </div>
            </fieldset>
          )}
          {step === 1 && (
            <fieldset>
              <legend tabIndex={-1}>Quel est votre objectif principal&nbsp;?</legend>
              <p className="form-intro">Votre objectif ajuste les repères proposés par Soma, pas l’effort déjà accompli.</p>
              <div className="choice-grid">
                {Object.entries(localizedGoalLabels).map(([value, label]) => (
                  <label className={form.primaryGoal === value ? "choice-card is-selected" : "choice-card"} key={value}>
                    <input type="radio" name="primaryGoal" value={value} checked={form.primaryGoal === value} onChange={() => update("primaryGoal", value as OnboardingInput["primaryGoal"])} />
                    <span><strong>{label}</strong><small>Objectif principal</small></span>
                    {form.primaryGoal === value && <Check size={18} aria-hidden="true" />}
                  </label>
                ))}
              </div>
              <label className="field field--secondary">Objectif secondaire (facultatif)<select value={form.secondaryGoal ?? ""} onChange={(event) => update("secondaryGoal", event.target.value ? event.target.value as OnboardingInput["primaryGoal"] : null)}><option value="">Aucun objectif secondaire</option>{Object.entries(localizedGoalLabels).filter(([value]) => value !== form.primaryGoal).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset>
              <legend tabIndex={-1}>Vos habitudes de santé</legend>
              <p className="form-intro">Sélectionnez les repères utiles pour votre journal quotidien. Vous pourrez les modifier à tout moment.</p>

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
                              <span className="habit-card__badge">Sur-mesure</span>
                            </span>
                            <button
                              type="button"
                              className="habit-card__remove"
                              onClick={(e) => removeCustomHabit(item.name, e)}
                              aria-label={`Supprimer l'habitude ${item.name}`}
                              title="Supprimer"
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
                <span className="habit-custom-creator-title">Ajouter une habitude sur-mesure</span>
                <div className="habit-custom-row">
                  <input
                    type="text"
                    className="habit-custom-input"
                    placeholder="Ex. Méditation 10 min, Pas d'écran après 22 h…"
                    value={newHabitName}
                    maxLength={80}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomHabit(e as unknown as React.MouseEvent); } }}
                    aria-label="Nom de l'habitude sur-mesure"
                  />
                  <select
                    className="habit-custom-select"
                    value={newHabitCategory}
                    onChange={(e) => setNewHabitCategory(e.target.value as HabitCategory)}
                    aria-label="Thématique de l'habitude"
                  >
                    <option value="sleep">Sommeil</option>
                    <option value="nutrition">Nutrition</option>
                    <option value="activity">Activité</option>
                  </select>
                  <button
                    type="button"
                    className="secondary-button habit-custom-add-btn"
                    onClick={addCustomHabit}
                    disabled={!newHabitName.trim()}
                  >
                    <Plus size={15} aria-hidden="true" /> Ajouter
                  </button>
                </div>
              </div>
            </fieldset>
          )}
          {step === 3 && (
            <fieldset>
              <legend tabIndex={-1}>Poser votre base de sommeil</legend>
              <p className="form-intro">Votre objectif de sommeil reste le même en semaine, le week-end et en vacances.</p>

              <div className="sleep-slider-control">
                <div className="sleep-slider-header">
                  <div className="sleep-slider-labels">
                    <span className="sleep-slider-title">Objectif de sommeil</span>
                    <small className="sleep-slider-tolerance">
                      Fourchette acceptée&nbsp;: {toleranceLow} à {toleranceHigh}
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
                    aria-label="Objectif de sommeil"
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

              <label className="field field--wake">Heure habituelle de réveil<input type="time" required value={form.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /><small>Cette heure sert de repère à votre première recommandation de coucher.</small></label>
            </fieldset>
          )}
          {step === 4 && (
            <fieldset>
              <legend tabIndex={-1}>Connecter vos données de santé</legend>
              <p className="form-intro">Soma peut importer vos données de sommeil, d’activité et de santé. Si Fitbit est relié à Google Health, ces données pourront aussi être utilisées. L’import commence par les 90 derniers jours&nbsp;; l’historique plus ancien suit en arrière-plan.</p>

              <div className="import-choices">
                <label className={form.importRange === "90_days" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "90_days"} onChange={() => update("importRange", "90_days")} /><span><strong>Les 90 derniers jours</strong><small>Un premier import plus rapide, suffisant pour établir des repères utiles.</small></span></label>
                <label className={form.importRange === "all_history" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "all_history"} onChange={() => update("importRange", "all_history")} /><span><strong>Tout l’historique disponible</strong><small>Les données récentes apparaissent d’abord&nbsp;; l’ancien suit en arrière-plan.</small></span></label>
              </div>

              <div className="consent-preview" role="note">
                <strong>Vous vérifierez les accès sur Google ensuite.</strong>
                <p>Soma demande uniquement la lecture des données de sommeil, d’activité et de santé. Vous pouvez refuser certains accès, terminer sans connecter Google Health ou déconnecter plus tard.</p>
              </div>

              {/* Welcoming Card for users without a connected watch */}
              <div className="no-watch-welcoming-card" role="region" aria-label="Option sans montre connectée">
                <div className="no-watch-welcoming-card__header">
                  <Watch className="no-watch-welcoming-card__icon" size={22} aria-hidden="true" />
                  <div className="no-watch-welcoming-card__body">
                    <strong>Pas de montre connectée ? Vous pouvez utiliser le journal quotidien et le suivi des repas dès aujourd&apos;hui.</strong>
                    <p>Soma fonctionne parfaitement comme carnet de bord personnel : suivez vos repas, vos scores d&apos;alimentation et vos habitudes sans aucun capteur matériel.</p>
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
                    <span>Terminer sans connecter</span>
                  </button>
                </div>
              </div>
            </fieldset>
          )}

          {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
          <div className="form-navigation">
            <button className="secondary-button" type="button" onClick={() => goToStep(Math.max(0, step - 1))} disabled={step === 0 || saving}><ArrowLeft size={17} aria-hidden="true" /> Précédent</button>
            {step < steps.length - 1 ? (
              <button className="primary-button" type="button" onClick={continueToNextStep}>Continuer <ArrowRight size={17} aria-hidden="true" /></button>
            ) : (
              <div className="onboarding-finish-actions">
                <button className="text-link" type="button" onClick={() => void finish(false)} disabled={saving}>Terminer sans connecter</button>
                <button className="primary-button" type="button" onClick={() => void finish(true)} disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}{saving ? "Enregistrement…" : "Enregistrer puis connecter Google Health"}</button>
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
