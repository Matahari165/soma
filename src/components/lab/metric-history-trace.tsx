/** Same five daily observations as the bars; missing values break the line. */
export function MetricHistoryTrace({ values, maximum, labels }: { values: Array<number | null>; maximum: number; labels?: readonly string[] }) {
  const segments: Array<Array<[number, number]>> = [];
  let segment: Array<[number, number]> = [];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
      return;
    }
    segment.push([4 + index / Math.max(1, values.length - 1) * 192, 68 - Math.min(1, Math.max(0, value / maximum)) * 60]);
  });
  if (segment.length) segments.push(segment);
  const description = values.map((value, index) => labels?.[index] ?? (value === null ? `Point ${index + 1} : absence de mesure` : `Point ${index + 1} : ${value}`)).join(" ; ");
  return <span className="personal-lab-metric__trace-wrap">
    <svg className="personal-lab-metric__trace" viewBox="0 0 200 76" preserveAspectRatio="none" role="img" aria-label={`Tendance des cinq derniers jours. ${description}. Les absences ne sont pas reliées.`}>
      <line className="metric-trace-baseline" x1="4" x2="196" y1="68" y2="68" />
      {segments.map((points, index) => <g key={index}>
        {points.length > 1 && <polygon className="metric-trace-area" points={`${points[0][0]},68 ${points.map(p => p.join(',')).join(' ')} ${points[points.length - 1][0]},68`} />}
        <polyline className="metric-trace-line" points={points.map(p => p.join(',')).join(' ')} />
        {points.map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.8"><title>{labels?.[values.findIndex((_, i) => 4 + i / Math.max(1, values.length - 1) * 192 === x)] ?? "Mesure"}</title></circle>)}
      </g>)}
    </svg>
    <span className="sr-only"><ul>{values.map((value, index) => <li key={index}>{labels?.[index] ?? (value === null ? `Point ${index + 1} : —` : `Point ${index + 1} : ${value}`)}</li>)}</ul></span>
  </span>;
}
