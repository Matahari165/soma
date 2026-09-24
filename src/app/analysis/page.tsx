import type { Metadata } from "next";
import { Suspense } from "react";

import { StrongestEffectsPanel } from "@/components/lab/correlation-matrix";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";

import { AnalysisLoading } from "./analysis-loading";
import styles from "./analysis-page.module.css";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function AnalysisPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  return <Suspense fallback={<AnalysisLoading />}>
    <main id="main-page-content" className={styles.page} lang="en">
      <header className={styles.header}><h1>Analysis</h1></header>
      <StrongestEffectsPanel showSummary />
    </main>
  </Suspense>;
}
