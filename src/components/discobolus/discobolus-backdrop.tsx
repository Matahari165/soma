"use client";

import React from "react";
import {
  type DiscobolusIntensity,
  type DiscobolusRenderMode,
  type DiscobolusVariant,
  normalizeDiscobolusVariant,
} from "./discobolus-types";
import styles from "./discobolus-backdrop.module.css";

export interface DiscobolusBackdropProps {
  readonly variant?: DiscobolusVariant;
  readonly intensity?: DiscobolusIntensity;
  readonly renderMode?: DiscobolusRenderMode;
  readonly className?: string;
  readonly placement?: "hero" | "fixed";
}

const PHOTO_MAP: Record<string, string | null> = {
  monumental: "/images/discobolus/discobolus-left-monumental.png",
  superposed: "/images/discobolus/discobolus-left-monumental.png",
  // Legacy aliases
  "cinematic-flow": "/images/discobolus/discobolus-left-monumental.png",
  "focus-flank": "/images/discobolus/discobolus-left-monumental.png",
  "chiaroscuro-side": "/images/discobolus/discobolus-left-monumental.png",
  "side-flank-right": "/images/discobolus/discobolus-left-monumental.png",
  "side-flank-left": "/images/discobolus/discobolus-left-monumental.png",
  "side-kinetic": "/images/discobolus/discobolus-left-monumental.png",
  "side-chiaroscuro": "/images/discobolus/discobolus-left-monumental.png",
  "side-etching": "/images/discobolus/discobolus-left-monumental.png",
  mineral: "/images/discobolus/discobolus-left-monumental.png",
  kinetic: "/images/discobolus/discobolus-left-monumental.png",
  chiaroscuro: "/images/discobolus/discobolus-left-monumental.png",
  etching: "/images/discobolus/discobolus-left-monumental.png",
  monolith: "/images/discobolus/discobolus-left-monumental.png",
  off: null,
};

export function DiscobolusBackdrop({
  variant = "monumental",
  intensity = "normal",
  renderMode = "hybrid",
  className = "",
  placement = "hero",
}: DiscobolusBackdropProps) {
  const scrollLayerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId: number | null = null;

    const updateScrollEffect = () => {
      const el = scrollLayerRef.current;
      if (!el) return;

      const scrollY = window.scrollY || window.pageYOffset || 0;
      // Plage d'estompage progressif au fil du scroll: 0 -> 380px
      const fadeThreshold = 380;
      const progress = Math.min(1, Math.max(0, scrollY / fadeThreshold));

      // Courbe douce de dissipation (cosinus / smooth ease-out)
      const opacity = Math.max(0, Math.cos((progress * Math.PI) / 2));
      // Parallaxe douce: 0.35px par pixel de scroll vers le bas
      const translateY = scrollY * 0.35;
      // Flou de dissipation subtil (0px -> 4px)
      const blurPx = progress * 4;

      el.style.setProperty("--statue-scroll-opacity", opacity.toFixed(3));
      el.style.setProperty("--statue-scroll-y", `${translateY.toFixed(1)}px`);
      el.style.setProperty("--statue-scroll-blur", `${blurPx.toFixed(1)}px`);
      el.style.setProperty(
        "--statue-pointer-events",
        progress >= 0.96 ? "none" : "auto"
      );
    };

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        updateScrollEffect();
        rafId = null;
      });
    };

    updateScrollEffect();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [variant]);

  if (variant === "off") {
    return null;
  }

  const normalized = normalizeDiscobolusVariant(variant);

  const variantClass =
    {
      monumental: styles.variantMonumental,
      superposed: styles.variantSuperposed,
      // Legacy mapping
      "cinematic-flow": styles.variantMonumental,
      "focus-flank": styles.variantMonumental,
      "chiaroscuro-side": styles.variantMonumental,
      "side-flank-right": styles.variantMonumental,
      "side-flank-left": styles.variantMonumental,
      "side-kinetic": styles.variantMonumental,
      "side-chiaroscuro": styles.variantMonumental,
      "side-etching": styles.variantSuperposed,
      mineral: styles.variantMonumental,
      kinetic: styles.variantMonumental,
      chiaroscuro: styles.variantMonumental,
      etching: styles.variantSuperposed,
      monolith: styles.variantMonumental,
      off: styles.variantOff,
    }[variant] || styles.variantMonumental;

  const photoSrc = PHOTO_MAP[variant] || PHOTO_MAP[normalized];
  const showPhoto = renderMode !== "vector" && Boolean(photoSrc);
  const showVectorStatue = renderMode === "vector";

  return (
    <div
      className={`${styles.backdropRoot} ${styles.flankLeft} ${variantClass} ${className}`}
      data-variant={variant}
      data-intensity={intensity}
      data-render-mode={renderMode}
      data-placement={placement}
      aria-hidden="true"
    >
      <div ref={scrollLayerRef} className={styles.statueScrollLayer}>
        <div className={styles.statueWrapper}>
          {showPhoto && photoSrc && (
            <div className={styles.statuePhotoLayer}>
              {/* This decorative layer relies on the existing CSS image geometry; Next Image would alter it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSrc}
                srcSet="/images/discobolus/discobolus-left-monumental.png 2x, /images/discobolus/discobolus-left-monumental.png 1x"
                alt="Haut de la statue du Discobole de Myron"
                className={styles.statuePhotoImg}
                loading="eager"
                decoding="async"
              />
            </div>
          )}
          {/* Voile d'ombre protecteur délicat sous le titre */}
          <div className={styles.statueShadowVeil} aria-hidden="true" />
          <svg
            className={styles.statueSvg}
            viewBox="0 0 700 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Dégradés minéraux et marbre antique blanc pur */}
              <linearGradient id="marbleGradient" x1="20%" y1="10%" x2="80%" y2="90%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                <stop offset="40%" stopColor="#f5f7f6" stopOpacity="0.90" />
                <stop offset="75%" stopColor="#dbe0dd" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#9aa29e" stopOpacity="0.6" />
              </linearGradient>

              <linearGradient id="marbleShadow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a1e1c" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#121614" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#0a0d0c" stopOpacity="0.75" />
              </linearGradient>

              {/* Motif estampe pour poster typo */}
              <pattern
                id="lithoHatchFine"
                width="6"
                height="6"
                patternTransform="rotate(42 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="#1a1e1c"
                  strokeWidth="0.85"
                  strokeOpacity="0.55"
                />
              </pattern>
            </defs>



            {/* ══════════════════════════════════════════════════════════════════
                CALQUE VECTORIEL DE BASE (Mode vector ou fallback)
            ══════════════════════════════════════════════════════════════════ */}
            {(showVectorStatue || !showPhoto) && (
              <g id="discobolusStatueGroup">
                {/* Torse en torsion */}
                <path
                  d="M 335 320 C 375 285, 420 300, 440 340 C 465 390, 460 460, 445 520 C 430 580, 410 640, 395 720 C 360 705, 335 660, 330 600 C 325 540, 310 470, 315 410 C 320 370, 325 340, 335 320 Z"
                  fill="url(#marbleGradient)"
                  stroke="#2a302d"
                  strokeWidth="1.2"
                  strokeOpacity="0.5"
                />

                {/* Bras droit armant le disque */}
                <path
                  d="M 135 165 C 175 190, 230 230, 280 270 C 310 295, 340 315, 365 330 C 355 350, 335 355, 315 340 C 270 305, 215 260, 165 210 Z"
                  fill="url(#marbleGradient)"
                  stroke="#2a302d"
                  strokeWidth="1.2"
                />

                {/* Disque circulaire oblique */}
                <ellipse
                  cx="135"
                  cy="165"
                  rx="68"
                  ry="34"
                  transform="rotate(-24 135 165)"
                  fill="url(#marbleGradient)"
                  stroke="#2a302d"
                  strokeWidth="1.6"
                />

                {/* Tête de profil classique */}
                <path
                  d="M 350 250 C 330 240, 320 220, 325 198 C 330 178, 350 165, 372 170 C 395 175, 408 195, 405 218 C 402 238, 385 255, 350 250 Z"
                  fill="url(#marbleGradient)"
                  stroke="#2a302d"
                  strokeWidth="1.2"
                />
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
