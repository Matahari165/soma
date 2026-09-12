export type DiscobolusVariant =
  | "monumental"
  | "superposed"
  | "cinematic-flow"
  | "focus-flank"
  | "chiaroscuro-side"
  | "off"
  // Legacy aliases for smooth backward compatibility
  | "side-flank-right"
  | "side-flank-left"
  | "side-kinetic"
  | "side-chiaroscuro"
  | "side-etching"
  | "mineral"
  | "kinetic"
  | "chiaroscuro"
  | "etching"
  | "monolith";

export type DiscobolusIntensity = "subtle" | "normal" | "pronounced";

export type DiscobolusRenderMode = "hybrid" | "photo" | "vector";

export type DiscobolusSide = "left" | "none";

export const DISCOBOLUS_RENDER_MODES: readonly {
  readonly id: DiscobolusRenderMode;
  readonly label: string;
}[] = [
  { id: "hybrid", label: "Hybride" },
  { id: "photo", label: "Photo d'art" },
  { id: "vector", label: "Tracé vectoriel" },
] as const;

export const DISCOBOLUS_RENDER_MODE_KEY = "soma_discobolus_render_mode";

export interface DiscobolusVariantMeta {
  readonly id: DiscobolusVariant;
  readonly name: string;
  readonly shortLabel: string;
  readonly tagline: string;
  readonly description: string;
  readonly side: DiscobolusSide;
  readonly theme: "light" | "dark";
  readonly defaultIntensity: DiscobolusIntensity;
}

export const DISCOBOLUS_VARIANTS: readonly DiscobolusVariantMeta[] = [
  {
    id: "monumental",
    name: "1. Voile Éthéré",
    shortLabel: "Voile Éthéré",
    tagline: "Statue déployée avec voile d'ombre vaporeux sous le titre",
    description: "Statue déployée majestueusement avec voile d'ombre vaporeux sous le titre, respiration ample de 8s, élégance calme et contemplative.",
    side: "left",
    theme: "dark",
    defaultIntensity: "normal",
  },
  {
    id: "superposed",
    name: "2. Bas-Relief",
    shortLabel: "Bas-Relief",
    tagline: "Statue sculpturale avec ombres taillées et lumière rasante",
    description: "Statue déployée avec un voile d'ombre sculpté sous le titre et rehauts de lumière rasante en bas-relief.",
    side: "left",
    theme: "dark",
    defaultIntensity: "normal",
  },
  {
    id: "off",
    name: "✕ Désactivé",
    shortLabel: "Off",
    tagline: "Page neutre sans statue",
    description: "Désactive la présence sculpturale pour observer l'interface épurée.",
    side: "none",
    theme: "dark",
    defaultIntensity: "normal",
  },
] as const;

export const DISCOBOLUS_INTENSITIES: readonly {
  readonly id: DiscobolusIntensity;
  readonly label: string;
  readonly factor: number;
}[] = [
  { id: "subtle", label: "Subtil", factor: 0.65 },
  { id: "normal", label: "Normal", factor: 0.85 },
  { id: "pronounced", label: "Affirmé", factor: 0.96 },
] as const;

export const DISCOBOLUS_STORAGE_KEY = "soma_discobolus_variant";
export const DISCOBOLUS_INTENSITY_KEY = "soma_discobolus_intensity";

const KNOWN_VARIANTS: readonly string[] = [
  "monumental",
  "superposed",
  "cinematic-flow",
  "focus-flank",
  "chiaroscuro-side",
  "off",
  "side-flank-right",
  "side-flank-left",
  "side-kinetic",
  "side-chiaroscuro",
  "side-etching",
  "mineral",
  "kinetic",
  "chiaroscuro",
  "etching",
  "monolith",
];

export function isDiscobolusVariant(value: unknown): value is DiscobolusVariant {
  return typeof value === "string" && KNOWN_VARIANTS.includes(value);
}

export function isDiscobolusIntensity(value: unknown): value is DiscobolusIntensity {
  return typeof value === "string" && DISCOBOLUS_INTENSITIES.some((i) => i.id === value);
}

export function isDiscobolusRenderMode(value: unknown): value is DiscobolusRenderMode {
  return typeof value === "string" && DISCOBOLUS_RENDER_MODES.some((m) => m.id === value);
}

export function normalizeDiscobolusVariant(v: DiscobolusVariant): DiscobolusVariant {
  switch (v) {
    case "superposed":
    case "side-etching":
    case "etching":
      return "superposed";
    case "off":
      return "off";
    default:
      return "monumental";
  }
}

export function getInitialDiscobolusVariant(): DiscobolusVariant {
  if (typeof window === "undefined") return "monumental";
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const urlVariant = searchParams.get("statue") || searchParams.get("art");
    if (urlVariant && isDiscobolusVariant(urlVariant)) {
      return normalizeDiscobolusVariant(urlVariant);
    }
    const stored = localStorage.getItem(DISCOBOLUS_STORAGE_KEY);
    if (stored && isDiscobolusVariant(stored)) {
      return normalizeDiscobolusVariant(stored);
    }
  } catch {
    // Ignore restricted environment storage errors
  }
  return "monumental";
}

export function getInitialDiscobolusIntensity(): DiscobolusIntensity {
  if (typeof window === "undefined") return "normal";
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const urlIntensity = searchParams.get("intensity") || searchParams.get("opacite");
    if (urlIntensity && isDiscobolusIntensity(urlIntensity)) {
      return urlIntensity;
    }
    const stored = localStorage.getItem(DISCOBOLUS_INTENSITY_KEY);
    if (stored && isDiscobolusIntensity(stored)) {
      return stored;
    }
  } catch {
    // Ignore restricted environment storage errors
  }
  return "normal";
}

export function getInitialDiscobolusRenderMode(): DiscobolusRenderMode {
  if (typeof window === "undefined") return "hybrid";
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const urlMode = searchParams.get("mode") || searchParams.get("rendu");
    if (urlMode && isDiscobolusRenderMode(urlMode)) {
      return urlMode;
    }
    const stored = localStorage.getItem(DISCOBOLUS_RENDER_MODE_KEY);
    if (stored && isDiscobolusRenderMode(stored)) {
      return stored;
    }
  } catch {
    // Ignore restricted environment storage errors
  }
  return "hybrid";
}
