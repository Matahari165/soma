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
      <path className="soma-symbol__outer" d="M7 14.5C13 7.5 21 5 28.5 6.2 36 7.4 41.7 12.5 42 18.2 42.4 25.2 34.8 28.5 24.2 29.6 13.8 30.7 7 33.1 7.7 39.8" />
      <path className="soma-symbol__middle" d="M10.5 11.2C16.2 16.8 22.5 19 30.2 18.5 36.2 18.1 40.3 20 40.4 24.2 40.6 29.6 34.7 33 25.4 33.8 17.2 34.6 12.5 37.1 12.9 42" />
      <path className="soma-symbol__core" d="M8.2 24C13.8 21 19.8 20.7 27.1 22.2 34.7 23.8 39.8 27.3 39 32.3 38.1 38.2 30.2 41.7 20.8 41.6" />
    </svg>
  );
}

export function SomaLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "soma-logo soma-logo--compact" : "soma-logo"}>
      <SomaSymbol />
      <span className="soma-wordmark">
        <strong>SOMA</strong>
        {!compact && <small>PERSONAL HEALTH ATLAS</small>}
      </span>
    </span>
  );
}
