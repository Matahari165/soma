export default function Loading() {
  return (
    <section className="system-loading" id="main-page-content" lang="fr" role="status" aria-live="polite" aria-busy="true" aria-label="Chargement des repas">
      <div className="system-loading__header">
        <span className="eyebrow">Repas</span>
        <strong>Chargement des repas</strong>
        <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="system-loading__line" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </div>
      <span className="sr-only">Chargement…</span>
    </section>
  );
}
