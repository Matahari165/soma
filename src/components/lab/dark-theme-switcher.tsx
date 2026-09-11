"use client";

import { useState } from "react";

const themes = [
  { id: "observatory", name: "Observatoire" },
  { id: "strata", name: "Strates" },
  { id: "index", name: "Index" },
  { id: "atelier", name: "Atelier" },
  { id: "focus", name: "Focus" },
] as const;

/** Local design comparison: changes tokens without remounting the workspace. */
export function DarkThemeSwitcher() {
  const [selected, setSelected] = useState<string>("observatory");

  return <div className="dark-theme-switcher" role="group" aria-label="Variantes du mode sombre">
    {themes.map((theme) => <button
      key={theme.id}
      type="button"
      data-theme-option={theme.id}
      aria-pressed={selected === theme.id}
      onClick={() => {
        document.documentElement.dataset.labTheme = theme.id;
        setSelected(theme.id);
        window.dispatchEvent(new Event("lab-theme-change"));
      }}
    ><span className="dark-theme-switcher__swatch" aria-hidden="true" />{theme.name}</button>)}
  </div>;
}
