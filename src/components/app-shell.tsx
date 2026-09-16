"use client";

import {
  Activity,
  BedDouble,
  ChartNoAxesCombined,
  HeartPulse,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SomaLogo, SomaSymbol } from "@/components/soma-logo";
import type { SomaUser } from "@/lib/auth";

const navigation = [
  { label: "Laboratoire", href: "/", icon: LayoutDashboard },
  { label: "Analyse", href: "/analysis", icon: ChartNoAxesCombined },
  { label: "Alimentation", href: "/meals", icon: Utensils },
  { label: "Sommeil", href: "/sleep", icon: BedDouble },
  { label: "Récupération", href: "/recovery", icon: HeartPulse },
  { label: "Effort", href: "/activity", icon: Activity },
];

// Une seule source de navigation : le mobile reprend les mêmes destinations,
// sans le Laboratoire déjà accessible via la marque.

export function AppShell({ children, user, localPreview = false }: { children: React.ReactNode; user: SomaUser | null; localPreview?: boolean }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const displayName = user?.displayName ?? "Utilisateur Soma";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
  const isPersonalLab = pathname === "/";
  const isStitchWorkspace = ["/analysis", "/meals", "/sleep", "/recovery", "/activity"].some((route) => pathname.startsWith(route)) || isPersonalLab;
  const activeNavigation = navigation;
  const activeMobileNavigation = navigation.filter(({ href }) => href !== "/");

  if (
    ((pathname === "/" || pathname.startsWith("/analysis") || pathname.startsWith("/meals")) && !user) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms")
  ) {
    return <>{children}</>;
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className={["app-shell", localPreview && "app-shell--preview", sidebarCollapsed && "app-shell--sidebar-collapsed", isStitchWorkspace && "app-shell--personal-lab"].filter(Boolean).join(" ")}>
      <aside id="primary-sidebar" className={sidebarCollapsed ? "sidebar sidebar--collapsed" : "sidebar"} aria-label="Navigation principale">
        <div className="sidebar__header">
          <Link className="brand" href="/" aria-label="Accueil Soma">
            <SomaLogo compact={sidebarCollapsed} />
          </Link>
        </div>

        <nav className="sidebar-nav">
          {activeNavigation.map(({ label, href, icon: Icon }) => (
            <Link
              className={isActive(href) ? "nav-link nav-link--active" : "nav-link"}
              href={href}
              key={href}
              aria-current={isActive(href) ? "page" : undefined}
              aria-label={label}
              title={sidebarCollapsed ? label : undefined}
            >
              {isStitchWorkspace && href === "/" ? <SomaSymbol className="nav-brand-symbol" /> : <Icon size={19} strokeWidth={1.8} aria-hidden="true" />}
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-secondary">
          <button
            className="icon-button sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "Développer la barre latérale" : "Réduire la barre latérale"}
            aria-controls="primary-sidebar"
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? "Développer la barre latérale" : "Réduire la barre latérale"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
          <Link className={isActive("/settings") ? "profile-card profile-card--active" : "profile-card"} href="/settings" aria-label={`Ouvrir les réglages de ${displayName}`} title={sidebarCollapsed ? `Ouvrir les réglages de ${displayName}` : undefined}>
            <span className="avatar">{initials}</span>
            <span>
              <strong>{displayName}</strong>
              <small>Réglages</small>
            </span>
            <Settings size={17} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" aria-label="Accueil Soma">
          <SomaLogo />
        </Link>
        <nav className="mobile-header-nav" aria-label="Navigation principale mobile">
          {activeMobileNavigation.map(({ label, href, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={isActive(href) ? "mobile-header-nav__link mobile-header-nav__link--active" : "mobile-header-nav__link"}
              aria-current={isActive(href) ? "page" : undefined}
              aria-label={label}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main className="main-content">{children}</main>
    </div>
  );
}
