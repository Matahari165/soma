type SomaSymbolProps = {
  className?: string;
  title?: string;
};

export function SomaSymbol({ className = "brand-symbol", title }: SomaSymbolProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M4 6.5H20.5C25 6.5 28 8.5 28 12C28 15.5 24.5 17 20 17H12C8 17 5 18.5 5 22C5 25.5 8 27.5 12.5 27.5H28" />
      <path d="M4 11H20C21.8 11 23 11.4 23 12.2C23 13 21.8 13.4 20 13.4H12C4.8 13.4 1 16.6 1 22C1 27.6 5.2 31 12.5 31H28" />
      <path d="M4 2H21C27.7 2 31 5.8 31 12C31 18.2 26.2 21 20 21H12C10.7 21 10 21.3 10 22C10 22.7 10.8 23 12.5 23H28" />
    </svg>
  );
}

export function SomaLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "soma-logo soma-logo--compact" : "soma-logo"}>
      <SomaSymbol />
      <span className="soma-wordmark">
        <strong>SOMA</strong>
        {!compact && <small>VITAL SIGNAL</small>}
      </span>
    </span>
  );
}
