import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function TermsPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Soma home"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Terms · Version 1.0</span>
        <h1>Use Soma as guidance, not a diagnosis.</h1>
        <p>Last updated August 7, 2026.</p>
        <h2>Purpose</h2>
        <p>Soma helps you understand general sleep, recovery, activity, and training patterns from data you authorize.</p>
        <h2>Your responsibility</h2>
        <p>Device readings can be incomplete or inaccurate. Consider how you feel and seek qualified medical advice for symptoms, diagnoses, treatment, or urgent concerns.</p>
        <h2>Coach actions</h2>
        <p>Soma Coach may prepare changes, but write actions always require your explicit confirmation. You remain responsible for reviewing the preview.</p>
        <h2>Availability</h2>
        <p>Google Health, xAI, and hosting services can be interrupted or change their interfaces. Soma shows missing or stale states instead of presenting absent data as current.</p>
        <h2>Account control</h2>
        <p>You can stop using Soma, export your data, or permanently delete your account at any time.</p>
        <Link href="/settings">Return to settings</Link>
      </article>
    </main>
  );
}
