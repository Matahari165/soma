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
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path className="soma-symbol__outer" d="M24 3.5C35.8 3.5 44 11.3 44 23.5 44 36 35.7 44.5 23.4 44.5 11.2 44.5 4 36.8 4 24.5 4 12.2 11.9 3.5 24 3.5Z" />
      <path className="soma-symbol__middle" d="M34.7 14.3c-3-3.1-6.8-4.7-11.4-4.7-7.4 0-12.4 3.7-12.4 9 0 5.8 5.1 7.2 12.6 8.2 5.1.7 7.6 1.8 7.6 4.6 0 3.4-3.5 5.7-8.5 5.7-4.6 0-8.5-1.4-11.5-4.4" />
      <path className="soma-symbol__core" d="M31.4 17.8c-2.1-1.9-4.8-2.8-8-2.8-4.3 0-7 1.6-7 3.8 0 2.5 2.7 3.2 7.5 3.9 8.5 1.2 12.8 3.6 12.8 9 0 1.5-.3 2.9-.9 4.1" />
      <circle className="soma-symbol__seed" cx="37.6" cy="11" r="2.4" />
    </svg>
  );
}

export function SomaLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "soma-logo soma-logo--compact" : "soma-logo"}>
      <SomaSymbol />
      <span className="soma-wordmark">
        <strong>soma<span aria-hidden="true">°</span></strong>
        {!compact && <small>LIVING ATLAS</small>}
      </span>
    </span>
  );
}
