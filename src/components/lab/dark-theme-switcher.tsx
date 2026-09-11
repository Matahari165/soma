"use client";

import { useState } from "react";

const themes = [
  { id: "graphite", name: "Graphite" },
  { id: "obsidian", name: "Obsidienne" },
  { id: "slate", name: "Ardoise" },
  { id: "mineral", name: "Minéral" },
  { id: "ink", name: "Encre" },
] as const;

/** Local design comparison: changes tokens without remounting the workspace. */
export function DarkThemeSwitcher() {
  const [selected, setSelected] = useState<string>("graphite");

  return <div className="dark-theme-switcher" role="group" aria-label="Variantes du mode sombre">
    {themes.map((theme) => <button
      key={theme.id}
      type="button"
      data-theme-option={theme.id}
      aria-pressed={selected === theme.id}
      onClick={() => {
        document.documentElement.dataset.labTheme = theme.id;
        setSelected(theme.id);
      }}
    ><span className="dark-theme-switcher__swatch" aria-hidden="true" />{theme.name}</button>)}
  </div>;
}
