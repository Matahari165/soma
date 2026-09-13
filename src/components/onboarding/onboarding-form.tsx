"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { SomaLogo } from "@/components/soma-logo";
import { goalLabels, type OnboardingInput } from "@/domain/profile";

const steps = ["Vous", "Objectif", "Sommeil", "Données de santé"];

const localizedGoalLabels: Record<keyof typeof goalLabels, string> = {
  build_muscle: "Développer sa masse musculaire",
  improve_endurance: "Améliorer son endurance",
  improve_cardio: "Améliorer son cardio",
  general_fitness: "Améliorer sa forme générale",
  maintain_health: "Préserver sa santé",
  other: "Autre objectif",
};

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
  baseSleepTargetMinutes: 510,
  usualWakeTime: "07:00",
  importRange: "all_history",
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
      const input: OnboardingInput = { ...form, heightCm: form.heightCm, weightKg: form.weightKg, timezone };
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
              <legend tabIndex={-1}>Poser votre base de sommeil</legend>
              <p className="form-intro">Votre objectif de sommeil reste le même en semaine, le week-end et en vacances.</p>
              <div className="sleep-target-control">
                <span>Objectif de sommeil</span>
                <strong>8 h 30</strong>
                <small>Fourchette acceptée&nbsp;: 8 h 20 à 8 h 40</small>
              </div>
              <label className="field field--wake">Heure habituelle de réveil<input type="time" required value={form.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /><small>Cette heure sert de repère à votre première recommandation de coucher.</small></label>
            </fieldset>
          )}
          {step === 3 && (
            <fieldset>
              <legend tabIndex={-1}>Connecter vos données de santé</legend>
              <p className="form-intro">Soma peut importer vos données de sommeil, d’activité et de santé. Si Fitbit est relié à Google Health, ces données pourront aussi être utilisées. L’import commence par les 90 derniers jours&nbsp;; l’historique plus ancien suit en arrière-plan.</p>
              <div className="import-choices">
                <label className={form.importRange === "90_days" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "90_days"} onChange={() => update("importRange", "90_days")} /><span><strong>Les 90 derniers jours</strong><small>Un premier import plus rapide, suffisant pour établir des repères utiles.</small></span></label>
                <label className={form.importRange === "all_history" ? "import-card is-selected" : "import-card"}><input type="radio" name="importRange" checked={form.importRange === "all_history"} onChange={() => update("importRange", "all_history")} /><span><strong>Tout l’historique disponible</strong><small>Les données récentes apparaissent d’abord&nbsp;; l’ancien suit en arrière-plan.</small></span></label>
              </div>
              <div className="consent-preview" role="note"><strong>Vous vérifierez les accès sur Google ensuite.</strong><p>Soma demande uniquement la lecture des données de sommeil, d’activité et de santé. Vous pouvez refuser certains accès, terminer sans connecter Google Health ou déconnecter plus tard.</p></div>
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
