type SomaSymbolProps = {
  className?: string;
  title?: string;
};

export function SomaSymbol({ className = "brand-symbol", title }: SomaSymbolProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle className="soma-symbol__dish" cx="24" cy="24" r="15.5" vectorEffect="non-scaling-stroke" strokeWidth="1.7" />
      <path className="soma-symbol__measure" d="M8.5 24h31" vectorEffect="non-scaling-stroke" strokeWidth="1.35" opacity=".46" />
      <circle className="soma-symbol__sample" cx="29.5" cy="24" r="3.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

type SomaLogoProps = {
  className?: string;
  compact?: boolean;
};

export function SomaLogo({ className, compact = false }: SomaLogoProps) {
  const logoClassName = ["soma-logo", compact && "soma-logo--compact", className].filter(Boolean).join(" ");

  return (
    <span className={logoClassName}>
      <SomaSymbol />
      <span className="soma-wordmark">
        <strong>SOMA</strong>
      </span>
    </span>
  );
}
