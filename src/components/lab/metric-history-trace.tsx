/** Same five daily observations as the bars; missing values break the line. */
export function MetricHistoryTrace({ values, maximum }: { values: Array<number | null>; maximum: number }) {
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
  return <svg className="personal-lab-metric__trace" viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true">
    <line className="metric-trace-baseline" x1="4" x2="196" y1="68" y2="68" />
    {segments.map((points, index) => <g key={index}>
      {points.length > 1 && <polygon className="metric-trace-area" points={`${points[0][0]},68 ${points.map(p => p.join(',')).join(' ')} ${points[points.length - 1][0]},68`} />}
      <polyline className="metric-trace-line" points={points.map(p => p.join(',')).join(' ')} />
      {points.map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.8" />)}
    </g>)}
  </svg>;
}
