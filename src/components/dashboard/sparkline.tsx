const WIDTH = 132;
const HEIGHT = 42;
const PADDING = 3;

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = PADDING + (index / Math.max(values.length - 1, 1)) * (WIDTH - PADDING * 2);
      const y = HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      {values.map((value, index) => {
        const [cx, cy] = points.split(" ")[index].split(",");
        return <circle key={`${value}-${index}`} cx={cx} cy={cy} r={index === values.length - 1 ? 3 : 1.8} />;
      })}
    </svg>
  );
}
