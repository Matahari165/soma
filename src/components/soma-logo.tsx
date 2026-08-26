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
      <path
        className="soma-symbol__flask"
        d="M20 8v10L10.8 36.2A3.4 3.4 0 0 0 13.8 41h20.4a3.4 3.4 0 0 0 3-4.8L28 18V8"
        vectorEffect="non-scaling-stroke"
        strokeWidth="2"
      />
      <path className="soma-symbol__rim" d="M18 8h12" vectorEffect="non-scaling-stroke" strokeWidth="2" />
      <path className="soma-symbol__liquid" d="M14.5 32h19" vectorEffect="non-scaling-stroke" strokeWidth="1.5" />
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
