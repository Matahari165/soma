import pageStyles from "./analysis-page.module.css";
import { StrongestEffectsLoading } from "@/components/lab/strongest-effects-loading";

export function AnalysisLoading() {
  return (
    <main
      id="main-page-content"
      className={pageStyles.page}
      lang="en"
      aria-busy="true"
    >
      <header className={pageStyles.header}>
        <h1>Analysis</h1>
      </header>

      <StrongestEffectsLoading showSummary statusMessage="Loading analysis…" />
    </main>
  );
}
