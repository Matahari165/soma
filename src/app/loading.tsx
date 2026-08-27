export default function Loading() {
  return (
    <section className="system-loading" id="main-page-content" role="status" aria-live="polite" aria-busy="true" aria-label="Loading Soma data">
      <div className="system-loading__header">
        <span className="eyebrow">Soma</span>
        <strong>Preparing this view</strong>
        <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="system-loading__metrics" aria-hidden="true">
        <span><i /></span><span><i /></span><span><i /></span>
      </div>
      <div className="system-loading__line" aria-hidden="true">
        {Array.from({ length: 13 }, (_, index) => <i key={index} />)}
      </div>
      <span className="sr-only">Loading…</span>
    </section>
  );
}
