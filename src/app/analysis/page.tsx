import type { Metadata } from "next";
import { Suspense } from "react";

import { StrongestEffectsPanel } from "@/components/lab/correlation-matrix";
import { LoadingSurface } from "@/components/loading-surface";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";

import styles from "./analysis-page.module.css";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function AnalysisPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  return <Suspense fallback={<LoadingSurface eyebrow="Analyse" title="Chargement de l’analyse" label="Chargement de l’analyse" />}>
    <main id="main-page-content" className={styles.page} lang="fr">
      <header className={styles.header}><h1>Analyse</h1></header>
      <StrongestEffectsPanel />
    </main>
  </Suspense>;
}
