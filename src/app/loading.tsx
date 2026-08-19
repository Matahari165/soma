export default function Loading() {
  return (
    <section className="system-loading" id="main-page-content" aria-busy="true" aria-label="Loading Soma data">
      <div className="system-loading__header" />
      <div className="system-loading__metrics">
        <span /><span /><span />
      </div>
      <div className="system-loading__line" />
      <span className="sr-only">Loading…</span>
    </section>
  );
}
