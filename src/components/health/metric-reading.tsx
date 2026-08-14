export function MetricReading({ value, unit, className = "" }: { value: string | number; unit?: string; className?: string }) {
  return <strong className={`metric-reading ${className}`.trim()}><span>{value}</span>{unit ? <small>{unit}</small> : null}</strong>;
}
