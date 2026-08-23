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
      <path className="soma-symbol__line soma-symbol__axis" d="M10 38h28" vectorEffect="non-scaling-stroke" strokeWidth="1.35" opacity=".44" />
      <path className="soma-symbol__line soma-symbol__signal" d="M10 31.5 18 23l6 5 13-14" vectorEffect="non-scaling-stroke" strokeWidth="1.9" />
      <path className="soma-symbol__line soma-symbol__measure" d="M10 10v28" vectorEffect="non-scaling-stroke" strokeWidth="1.35" opacity=".44" />
      <circle className="soma-symbol__node" cx="10" cy="31.5" r="2.4" fill="currentColor" stroke="none" />
      <circle className="soma-symbol__node" cx="18" cy="23" r="2.4" fill="currentColor" stroke="none" />
      <circle className="soma-symbol__node" cx="24" cy="28" r="2.4" fill="currentColor" stroke="none" />
      <circle className="soma-symbol__node" cx="37" cy="14" r="2.4" fill="currentColor" stroke="none" />
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
