import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function TermsPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Soma Home"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Terms · Version 1.0</span>
        <h1>Use Soma as a guide, not as medical diagnosis.</h1>
        <p>Last updated: August 7, 2026.</p>
        <h2>Purpose</h2>
        <p>Soma helps you understand general trends across sleep, recovery, activity, and training from the data sources you connect.</p>
        <h2>Your responsibility</h2>
        <p>Device measurements may be incomplete or inaccurate. Listen to your body and seek qualified medical advice for any symptoms, diagnosis, treatment, or emergency.</p>
        <h2>Availability</h2>
        <p>Google Health, xAI, and hosting services may experience interruptions or interface updates. Soma displays absent or stale data explicitly rather than presenting it as current.</p>
        <h2>Account control</h2>
        <p>You may stop using Soma, export your data, or permanently delete your account at any time.</p>
        <Link href="/settings">Back to settings</Link>
      </article>
    </main>
  );
}
