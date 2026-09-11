"use client";

import { labThemes, useLabTheme } from "./lab-theme";

/** Local design comparison: changes tokens without remounting the workspace. */
export function DarkThemeSwitcher() {
  const selected = useLabTheme();

  return <div className="dark-theme-switcher" role="group" aria-label="Variantes du mode sombre">
    {labThemes.map((theme) => <button
      key={theme.id}
      type="button"
      data-theme-option={theme.id}
      aria-pressed={selected === theme.id}
      onClick={() => {
        document.documentElement.dataset.labTheme = theme.id;
        window.dispatchEvent(new Event("lab-theme-change"));
      }}
    ><span className="dark-theme-switcher__swatch" aria-hidden="true" />{theme.name}</button>)}
  </div>;
}
