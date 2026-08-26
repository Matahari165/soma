"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type AnimatedValueFormat = "number" | "decimal" | "duration";

const ANIMATION_DURATION_MS = 1_020;

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useAnimatedNumber(value: number | null, enabled = true) {
  const target = value !== null && Number.isFinite(value) ? value : null;
  const [displayed, setDisplayed] = useState<number | null>(target);
  const previousTarget = useRef(target);
  const mounted = useRef(false);

  useClientLayoutEffect(() => {
    const previous = previousTarget.current;
    const firstMount = !mounted.current;
    const from = firstMount ? (target === null ? null : 0) : previous;
    const changed = firstMount || previous !== target;
    mounted.current = true;
    previousTarget.current = target;

    if (!enabled || !changed) {
      setDisplayed(target);
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || typeof window.requestAnimationFrame !== "function" || from === null || target === null) {
      setDisplayed(target);
      return;
    }

    setDisplayed(from);
    const startedAt = performance.now();
    let frame = 0;
    let animationComplete = false;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ANIMATION_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + (target - from) * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else animationComplete = true;
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      // React Strict Mode probes effects twice in development. Replay the
      // first entrance when that probe interrupts it.
      if (firstMount && !animationComplete) {
        mounted.current = false;
        previousTarget.current = target;
      }
    };
  }, [enabled, target]);

  return displayed;
}

export function formatAnimatedValue(value: number | null, format: AnimatedValueFormat, decimals = 1) {
  if (value === null) return "—";
  if (format === "duration") {
    const absolute = Math.abs(Math.round(value));
    return `${Math.floor(absolute / 60)}h ${absolute % 60}m`;
  }
  if (format === "decimal") return value.toFixed(decimals);
  return Math.round(value).toLocaleString("en-US");
}

export function AnimatedValueText({
  value,
  format = "number",
  decimals = 1,
  suffix = "",
  showPlus = false,
  animate = true,
  className = "",
}: {
  value: number | null;
  format?: AnimatedValueFormat;
  decimals?: number;
  suffix?: string;
  showPlus?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const displayed = useAnimatedNumber(value, animate);
  const prefix = showPlus && value !== null && value > 0 ? "+" : "";
  const displayedPrefix = showPlus && displayed !== null && displayed > 0 ? "+" : "";
  const finalText = value === null ? "Not available" : `${prefix}${formatAnimatedValue(value, format, decimals)}${suffix}`;
  return <span className={className}>
    <span aria-hidden="true">{`${displayedPrefix}${formatAnimatedValue(displayed, format, decimals)}${suffix}`}</span>
    <span className="sr-only">{finalText}</span>
  </span>;
}

export function AnimatedMetricReading({
  value,
  unit,
  format = "number",
  decimals = 1,
  className = "",
  animate = true,
  showPlus = false,
}: {
  value: number | null;
  unit?: string;
  format?: AnimatedValueFormat;
  decimals?: number;
  className?: string;
  animate?: boolean;
  showPlus?: boolean;
}) {
  return <strong className={`metric-reading ${className}`.trim()}>
    <AnimatedValueText value={value} format={format} decimals={decimals} animate={animate} showPlus={showPlus} />
    {unit ? <small aria-hidden="true">{unit}</small> : null}
  </strong>;
}
