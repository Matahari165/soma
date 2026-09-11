type LabArrivalTheme = "observatory" | "strata" | "atelier" | "focus" | "index";

const themes = new Set<LabArrivalTheme>(["observatory", "strata", "atelier", "focus", "index"]);

function resolvedTheme(theme: string): LabArrivalTheme {
  return themes.has(theme as LabArrivalTheme) ? theme as LabArrivalTheme : "observatory";
}

function ObservatoryArt() {
  return <g className="arrival-art__observatory" fill="none" stroke="currentColor">
    <g className="arrival-art__orbit">
      <ellipse cx="300" cy="220" rx="174" ry="92" />
      <ellipse className="arrival-art__orbit--secondary" cx="300" cy="220" rx="126" ry="174" transform="rotate(34 300 220)" />
      <circle cx="300" cy="220" r="84" />
    </g>
    <g className="arrival-art__field">
      <path d="M76 220h448M300 44v352" />
      <path d="M118 196v48M154 206v28M190 196v48M410 196v48M446 206v28M482 196v48" />
      <path d="M276 78h48M286 112h28M276 328h48M286 364h28" />
    </g>
    <g className="arrival-art__constellation">
      <path d="M174 142l82 37 86-62 86 99-112 74-92-55z" />
      <circle cx="174" cy="142" r="5" fill="currentColor" />
      <circle cx="256" cy="179" r="4" fill="currentColor" />
      <circle cx="342" cy="117" r="5" fill="currentColor" />
      <circle cx="428" cy="216" r="5" fill="currentColor" />
      <circle cx="316" cy="290" r="4" fill="currentColor" />
      <circle cx="224" cy="235" r="4" fill="currentColor" />
    </g>
    <circle className="arrival-art__anchor" cx="300" cy="220" r="10" fill="currentColor" />
    <circle className="arrival-art__anchor-core" cx="300" cy="220" r="3" fill="var(--lab-canvas, currentColor)" stroke="none" />
  </g>;
}

function StrataArt() {
  return <g className="arrival-art__strata" fill="none" stroke="currentColor">
    <g className="arrival-art__contour">
      <path d="M32 310C106 250 142 344 210 294S328 226 390 278s105 42 178-28" />
      <path d="M24 342C94 288 144 374 218 326s113-65 178-10 112 40 180-18" />
      <path d="M18 376C88 326 150 402 226 354s115-62 174-12 112 46 182-8" />
      <path d="M62 272C122 220 164 290 222 252s96-76 158-34 100 56 166 0" />
      <path d="M102 224C148 188 184 232 228 206s74-70 126-48 86 56 142 18" />
      <path d="M146 178C182 158 208 176 246 158s64-48 104-30 70 42 112 24" />
    </g>
    <path className="arrival-art__contour--ridge" d="M66 328l76-54 56 18 68-76 68 38 76-58 104 56" />
    <path className="arrival-art__contour--axis" d="M72 392h456M92 112h416" />
    <g className="arrival-art__markers" fill="currentColor" stroke="none">
      <circle cx="142" cy="274" r="5" />
      <circle cx="266" cy="216" r="5" />
      <circle cx="410" cy="194" r="5" />
    </g>
  </g>;
}

function AtelierArt() {
  return <g className="arrival-art__atelier" fill="none" stroke="currentColor">
    <g className="arrival-art__sculpture">
      <path d="M182 308C144 260 158 178 218 142c62-38 146-20 186 34 35 47 26 117-26 150-52 34-156 36-196-18z" fill="currentColor" />
      <ellipse cx="300" cy="216" rx="128" ry="76" fill="var(--lab-canvas, currentColor)" stroke="none" />
      <ellipse cx="300" cy="216" rx="92" ry="48" />
      <path d="M164 258c36-34 74-50 114-48s83 20 158-36" />
      <path d="M186 310c38-48 72-68 116-64s78 14 116-16" />
      <circle cx="300" cy="216" r="18" fill="currentColor" />
      <circle cx="300" cy="216" r="6" fill="var(--lab-canvas, currentColor)" stroke="none" />
    </g>
    <path className="arrival-art__sculpture-line" d="M104 350h392M132 112h336" />
    <path className="arrival-art__sculpture-mark" d="M132 104v16M468 104v16M104 342v16M496 342v16" />
  </g>;
}

function FocusArt() {
  return <g className="arrival-art__focus" fill="none" stroke="currentColor">
    <path className="arrival-art__instrument-frame" d="M112 220h376M300 74v292" />
    <path className="arrival-art__instrument-arc" d="M172 220a128 128 0 0 1 256 0" />
    <path className="arrival-art__instrument-ticks" d="M194 168l-10-12M230 126l-7-15M276 104l-2-17M324 104l2-17M370 126l7-15M406 168l10-12" />
    <g className="arrival-art__needle">
      <line x1="300" y1="220" x2="388" y2="142" />
      <circle cx="300" cy="220" r="14" fill="currentColor" />
    </g>
    <circle className="arrival-art__cursor" cx="388" cy="142" r="5" fill="currentColor" />
    <path className="arrival-art__instrument-base" d="M248 294h104M266 294v22h68v-22" />
  </g>;
}

function IndexArt() {
  return <g className="arrival-art__index" fill="none" stroke="currentColor">
    <path className="arrival-art__grid" d="M84 84h432M84 144h432M84 204h432M84 264h432M84 324h432M84 384h432M84 84v300M156 84v300M228 84v300M300 84v300M372 84v300M444 84v300M516 84v300" />
    <g className="arrival-art__index-labels" fill="currentColor" stroke="none" fontFamily="var(--font-soma-mono, monospace)">
      <text x="96" y="124" fontSize="28">01</text>
      <text x="168" y="184" fontSize="22">SOMA</text>
      <text x="312" y="244" fontSize="18">LAB</text>
      <text x="384" y="364" fontSize="26">90</text>
    </g>
    <path className="arrival-art__index-scan" d="M84 204h432" />
    <circle className="arrival-art__index-mark" cx="444" cy="204" r="7" fill="currentColor" />
  </g>;
}

export function LabArrivalArt({ theme }: { theme: string }) {
  const variant = resolvedTheme(theme);
  const artwork = variant === "observatory" ? <ObservatoryArt />
    : variant === "strata" ? <StrataArt />
      : variant === "atelier" ? <AtelierArt />
        : variant === "focus" ? <FocusArt />
          : <IndexArt />;

  return <svg className={`arrival-artwork arrival-art--${variant}`} viewBox="0 0 600 440" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    {artwork}
  </svg>;
}
