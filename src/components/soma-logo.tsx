type SomaSymbolProps = {
  className?: string;
  title?: string;
};

export function SomaSymbol({ className = "brand-symbol", title }: SomaSymbolProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path className="soma-symbol__outer" d="M20 3.5c9.8 0 16.5 6.5 16.5 16.1 0 10.5-7.2 16.9-17.1 16.9C9.2 36.5 3.5 30 3.5 20.4 3.5 10.1 10 3.5 20 3.5Z" />
      <path className="soma-symbol__middle" d="M20.5 9.3c6.5 0 10.8 4 10.8 10.4 0 6.9-4.7 11-11.5 11-6.4 0-11.1-3.7-11.1-10.1 0-7 5.2-11.3 11.8-11.3Z" />
      <path className="soma-symbol__core" d="M24.7 15.1c-1.3-1.2-3-1.8-5.1-1.8-3.6 0-6 2-6 4.5 0 2.7 2.3 3.6 6.1 4.2 2 .3 3.2.8 3.2 2 0 1.3-1.2 2.3-3.4 2.3-2.1 0-4-.8-5.2-2.1" />
      <circle className="soma-symbol__seed" cx="28.5" cy="9.5" r="2.5" />
    </svg>
  );
}

export function SomaLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "soma-logo soma-logo--compact" : "soma-logo"}>
      <SomaSymbol />
      <span className="soma-wordmark">
        <strong>soma<span aria-hidden="true">.</span></strong>
        {!compact && <small>LIVING ATLAS</small>}
      </span>
    </span>
  );
}
