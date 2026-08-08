"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "day" | "night";

function preferredTheme(): Theme {
  const saved = window.localStorage.getItem("soma:theme");
  if (saved === "day" || saved === "night") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

export function ThemeInitializer() {
  useEffect(() => {
    document.documentElement.dataset.theme = preferredTheme();
  }, []);
  return null;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const next = preferredTheme();
    document.documentElement.dataset.theme = next;
    const frame = window.requestAnimationFrame(() => setTheme(next));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("soma:theme", next);
    setTheme(next);
  }

  const nextLabel = theme === "night" ? "Use day theme" : "Use night theme";

  return (
    <button className={compact ? "theme-toggle theme-toggle--compact" : "theme-toggle"} type="button" onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
      <span aria-hidden="true">{theme === "night" ? <Sun size={17} /> : <Moon size={17} />}</span>
      {!compact && <span>{theme === "night" ? "Day" : "Night"}</span>}
    </button>
  );
}
