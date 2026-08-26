import { useId } from "react";

type SomaSymbolProps = {
  className?: string;
  title?: string;
};

export function SomaSymbol({ className = "brand-symbol", title }: SomaSymbolProps) {
  const liquidClipId = `soma-liquid-clip-${useId().replaceAll(":", "")}`;

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
      <defs>
        <clipPath id={liquidClipId}>
          <path d="M20 8v10L10.8 36.2A3.4 3.4 0 0 0 13.8 41h20.4a3.4 3.4 0 0 0 3-4.8L28 18V8Z" />
        </clipPath>
      </defs>
      <rect className="soma-symbol__liquid-fill" x="8" y="32" width="32" height="10" clipPath={`url(#${liquidClipId})`} fill="currentColor" stroke="none" />
      <path
        className="soma-symbol__flask"
        d="M20 8v10L10.8 36.2A3.4 3.4 0 0 0 13.8 41h20.4a3.4 3.4 0 0 0 3-4.8L28 18V8"
        vectorEffect="non-scaling-stroke"
        strokeWidth="2"
      />
      <path className="soma-symbol__rim" d="M18 8h12" vectorEffect="non-scaling-stroke" strokeWidth="2" />
      <path className="soma-symbol__liquid" d="M14.5 32h19" vectorEffect="non-scaling-stroke" strokeWidth="1.5" />
      <g className="soma-symbol__bubbles" aria-hidden="true" fill="currentColor" stroke="none">
        <circle cx="22" cy="31" r="1.15" />
        <circle cx="26" cy="30" r=".92" />
        <circle cx="24" cy="28" r=".75" />
      </g>
    </svg>
  );
}

type SomaLogoProps = {
  className?: string;
  compact?: boolean;
};

export function SomaLogo({ className, compact = false }: SomaLogoProps) {
  const logoClassName = ["soma-logo", "soma-logo--loading", compact && "soma-logo--compact", className].filter(Boolean).join(" ");

  return (
    <span className={logoClassName}>
      <SomaSymbol />
      <span className="soma-wordmark">
        <strong>SOMA</strong>
      </span>
    </span>
  );
}
