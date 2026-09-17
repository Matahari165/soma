type LoadingSurfaceProps = {
  label: string;
  title: string;
  eyebrow?: string;
  variant?: "page" | "meals";
};

export function LoadingSurface({ label, title, eyebrow, variant = "page" }: LoadingSurfaceProps) {
  return (
    <section
      className={`system-loading system-loading--${variant}`}
      id="main-page-content"
      lang="en"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="system-loading__header">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <strong>{title}</strong>
      </div>
      <div className="system-loading__canvas" aria-hidden="true">
        <span className="system-loading__panel system-loading__panel--wide" />
        <span className="system-loading__panel" />
        <span className="system-loading__panel" />
      </div>
      <span className="sr-only">Loading…</span>
    </section>
  );
}
