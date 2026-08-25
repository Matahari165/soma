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
      <rect className="soma-symbol__frame" x="8" y="6.5" width="32" height="35" rx="8" vectorEffect="non-scaling-stroke" strokeWidth="1.7" />
      <path className="soma-symbol__measure" d="M15 17.5h18M15 24h18M15 30.5h10" vectorEffect="non-scaling-stroke" strokeWidth="1.35" />
      <circle className="soma-symbol__sample" cx="33" cy="30.5" r="2.25" fill="currentColor" stroke="none" />
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
