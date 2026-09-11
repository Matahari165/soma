"use client";
import { useLabArtwork } from "./lab-theme";

export function DarkThemeSwitcher() {
  const selected = useLabArtwork();
  return <div className="dark-theme-switcher" role="group" aria-label="Variantes du bandeau Observatoire">
    {[{id:"geometry",name:"Observatoire · Orbites"},{id:"radar",name:"Observatoire · Radar"}].map(variant => <button key={variant.id} type="button" aria-pressed={selected === variant.id} onClick={() => {
      document.documentElement.dataset.labTheme = "observatory";
      document.documentElement.dataset.labArt = variant.id;
      window.dispatchEvent(new Event("lab-theme-change"));
    }}>{variant.name}</button>)}
  </div>;
}
