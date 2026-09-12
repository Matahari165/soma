type SomaSymbolProps = {
  className?: string;
  title?: string;
};

export function SomaSymbol({ className = "brand-symbol", title }: SomaSymbolProps) {
  return (
    <span
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Static public brand mark: next/image optimization is disabled project-wide (see next.config.ts). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="soma-symbol__mark"
        src="/icons/soma-192.png?v=discobolus-5"
        alt=""
        width={192}
        height={192}
        decoding="async"
      />
    </span>
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
