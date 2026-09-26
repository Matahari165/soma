"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getColorScheme, setColorScheme, subscribeColorScheme } from "@/lib/color-scheme";
import styles from "./theme-toggle.module.css";

const getServerSnapshot = () => "light" as const;

export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const scheme = useSyncExternalStore(subscribeColorScheme, getColorScheme, getServerSnapshot);
  const label = scheme === "dark" ? "Activer le mode clair" : "Activer le mode sombre";
  return <button type="button" className={`${styles.toggle} ${mobile ? styles.mobile : ""}`} aria-label={label} onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}><Moon className={styles.moon} size={18} strokeWidth={1.5} aria-hidden="true" /><Sun className={styles.sun} size={18} strokeWidth={1.5} aria-hidden="true" /></button>;
}
