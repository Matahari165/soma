export function ObservatoryGeometry() {
  return (
    <svg className="observatory-geometry" viewBox="0 0 600 440" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <g className="observatory-geometry__orbital-set" fill="none">
        <ellipse className="observatory-geometry__orbit observatory-geometry__orbit--wide" cx="300" cy="220" rx="226" ry="104" />
        <ellipse className="observatory-geometry__orbit observatory-geometry__orbit--tilted" cx="300" cy="220" rx="178" ry="148" transform="rotate(-28 300 220)" />
        <ellipse className="observatory-geometry__orbit observatory-geometry__orbit--upright" cx="300" cy="220" rx="116" ry="188" transform="rotate(52 300 220)" />
      </g>
      <g className="observatory-geometry__arcs" fill="none">
        <path className="observatory-geometry__arc" d="M82 220C126 94 474 94 518 220" />
        <path className="observatory-geometry__arc observatory-geometry__arc--low" d="M112 220C160 350 440 350 488 220" />
      </g>
      <g className="observatory-geometry__lattice" fill="none">
        <path className="observatory-geometry__lattice-edge" d="M206 168Q300 106 394 168T410 252Q300 334 190 252T206 168Z" />
        <path className="observatory-geometry__lattice-edge observatory-geometry__lattice-edge--cross" d="M206 168Q300 220 394 168M190 252Q300 220 410 252M300 106V334" />
        <path className="observatory-geometry__axis" d="M132 220H468M300 72V368" />
      </g>
      <g className="observatory-geometry__nodes" fill="currentColor" stroke="none">
        <circle cx="206" cy="168" r="4" /><circle cx="394" cy="168" r="4" />
        <circle cx="410" cy="252" r="4" /><circle cx="190" cy="252" r="4" />
        <circle cx="300" cy="106" r="3" /><circle cx="300" cy="334" r="3" />
      </g>
      <g className="observatory-geometry__core" fill="none">
        <circle className="observatory-geometry__core-ring" cx="300" cy="220" r="31" />
        <circle className="observatory-geometry__core-ring observatory-geometry__core-ring--inner" cx="300" cy="220" r="13" />
        <circle className="observatory-geometry__core-point" cx="300" cy="220" r="5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
