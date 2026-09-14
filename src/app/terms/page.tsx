import type { Metadata } from "next";
import Link from "next/link";

import { SomaLogo } from "@/components/soma-logo";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default function TermsPage() {
  return (
    <main className="legal-page" id="main-page-content">
      <Link className="brand brand--auth" href="/" aria-label="Accueil Soma"><SomaLogo /></Link>
      <article>
        <span className="eyebrow">Conditions · Version 1.0</span>
        <h1>Utilisez Soma comme un guide, pas comme un diagnostic.</h1>
        <p>Dernière mise à jour : 7 août 2026.</p>
        <h2>Objectif</h2>
        <p>Soma vous aide à comprendre les tendances générales de sommeil, de récupération, d’activité et d’entraînement à partir des données que vous autorisez.</p>
        <h2>Votre responsabilité</h2>
        <p>Les mesures des appareils peuvent être incomplètes ou inexactes. Tenez compte de votre ressenti et demandez un avis médical qualifié en cas de symptômes, de diagnostic, de traitement ou d’urgence.</p>
        <h2>Disponibilité</h2>
        <p>Google Health, xAI et les services d’hébergement peuvent être interrompus ou modifier leurs interfaces. Soma affiche les données absentes ou obsolètes comme telles au lieu de les présenter comme actuelles.</p>
        <h2>Contrôle du compte</h2>
        <p>Vous pouvez cesser d’utiliser Soma, exporter vos données ou supprimer définitivement votre compte à tout moment.</p>
        <Link href="/settings">Retour aux réglages</Link>
      </article>
    </main>
  );
}
