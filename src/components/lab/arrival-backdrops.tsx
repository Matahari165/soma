"use client";

import { useEffect, useRef, useState } from "react";

export const BACKDROP_OPTIONS = [
  { id: "disco-large", label: "Disco" },
  { id: "mont-nuages-user", label: "Nuages" },
] as const;

export type ArrivalBackdropId = (typeof BACKDROP_OPTIONS)[number]["id"];

// Le décor appartient uniquement au premier écran. Il est découpé par le hero,
// puis fondu vers le noir avant le journal : aucune image ne reste derrière le contenu.
const HERO_LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  overflow: "hidden",
  pointerEvents: "none",
  willChange: "transform, opacity",
} as const;

const SCROLL_RANGE_PX = 560;

function Photo({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={alt} className={className} loading="eager" decoding="async" onError={() => setFailed(true)} />;
}

function DiscoLarge() {
  return <Photo
    src="/images/backdrops/discobole-wide.png"
    alt="Statue du Discobole de Myron, en grand"
    className="arrival-backdrop__image arrival-backdrop__image--disco"
  />;
}

function MontNuages({ source, alt }: { source: string; alt: string }) {
  return <>
    <Photo
      src={source}
      alt={alt}
      className="arrival-backdrop__image arrival-backdrop__image--crepuscule"
    />
  </>;
}

export function ArrivalBackdrop({ variant }: { variant: ArrivalBackdropId }) {
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const layer = layerRef.current;
      if (!layer) return;
      const scrollY = window.scrollY;
      const progress = Math.min(1, Math.max(0, scrollY / SCROLL_RANGE_PX));
      // Le décor accompagne la page vers le haut, s'estompe et se resserre : passé
      // le héros, il a disparu et le fond est complètement sombre.
      layer.style.transform = `translateY(${(scrollY * 0.12).toFixed(1)}px) scale(${(1 - 0.035 * progress).toFixed(4)})`;
      layer.style.opacity = Math.cos((progress * Math.PI) / 2).toFixed(3);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [variant]);
  if (!BACKDROP_OPTIONS.some((option) => option.id === variant)) return null;
  return <div ref={layerRef} className="arrival-backdrop" data-backdrop={variant} aria-hidden="true" style={HERO_LAYER_STYLE}>
    {variant === "disco-large" && <DiscoLarge />}
    {variant === "mont-nuages-user" && <MontNuages source="/images/backdrops/montagnes-nuages-utilisateur-v3.png" alt="Sommets alpins émergeant d'une vaste mer de nuages" />}
    <div className="arrival-backdrop__tone" />
    <div className="arrival-backdrop__fade" />
  </div>;
}
