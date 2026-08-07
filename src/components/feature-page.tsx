type Stat = {
  label: string;
  value: string;
  note: string;
};

export function FeaturePage({
  eyebrow,
  title,
  description,
  score,
  stats,
  nextTitle,
  nextDescription,
}: {
  eyebrow: string;
  title: string;
  description: string;
  score?: number;
  stats: Stat[];
  nextTitle: string;
  nextDescription: string;
}) {
  return (
    <div className="feature-page" id="main-page-content">
      <header className="feature-page__hero">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {score !== undefined && <div className="feature-score" aria-label={`${title} score ${score} out of 100`}>{score}<small>/100</small></div>}
      </header>
      <section className="feature-grid" aria-label={`${title} highlights`}>
        {stats.map((stat) => (
          <article className="feature-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <p>{stat.note}</p>
          </article>
        ))}
      </section>
      <section className="feature-placeholder">
        <h2>{nextTitle}</h2>
        <p>{nextDescription}</p>
      </section>
    </div>
  );
}
