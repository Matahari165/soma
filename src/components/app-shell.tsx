"use client";

import {
  Activity,
  BedDouble,
  ChartNoAxesCombined,
  HeartPulse,
  LayoutDashboard,
  MessageCircle,
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
  { label: "Personal Lab", href: "/", icon: LayoutDashboard },
  { label: "Soma", href: "/assistant", icon: MessageCircle },
  { label: "Analysis", href: "/analysis", icon: ChartNoAxesCombined },
  { label: "Nutrition", href: "/meals", icon: Utensils },
  { label: "Sleep", href: "/sleep", icon: BedDouble },
  { label: "Recovery", href: "/recovery", icon: HeartPulse },
  { label: "Strain", href: "/strain", icon: Activity },
];

// Single navigation source: mobile uses the same destinations,
// without Personal Lab which is already accessible via the logo.

export function AppShell({ children, user, localPreview = false }: { children: React.ReactNode; user: SomaUser | null; localPreview?: boolean }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const displayName = user?.displayName ?? "Soma User";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
  const isPersonalLab = pathname === "/";
  const isStitchWorkspace = ["/assistant", "/analysis", "/meals", "/sleep", "/recovery", "/strain"].some((route) => pathname.startsWith(route)) || isPersonalLab;
  const activeNavigation = navigation;
  const activeMobileNavigation = navigation.filter(({ href }) => href !== "/");

  if (
    ((pathname === "/" || pathname.startsWith("/assistant") || pathname.startsWith("/analysis") || pathname.startsWith("/meals")) && !user) ||
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
      <aside id="primary-sidebar" className={sidebarCollapsed ? "sidebar sidebar--collapsed" : "sidebar"} aria-label="Primary navigation">
        <div className="sidebar__header">
          <Link className="brand" href="/" prefetch={!localPreview} aria-label="Soma Home">
            <SomaLogo compact={sidebarCollapsed} />
          </Link>
        </div>

        <nav className="sidebar-nav">
          {activeNavigation.map(({ label, href, icon: Icon }) => (
            <Link
              className={isActive(href) ? "nav-link nav-link--active" : "nav-link"}
              href={href}
              prefetch={!localPreview}
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
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-controls="primary-sidebar"
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
          <Link className={isActive("/settings") ? "profile-card profile-card--active" : "profile-card"} href="/settings" prefetch={!localPreview} aria-label={`Open settings for ${displayName}`} title={sidebarCollapsed ? `Open settings for ${displayName}` : undefined}>
            <span className="avatar">{initials}</span>
            <span>
              <strong>{displayName}</strong>
              <small>Settings</small>
            </span>
            <Settings size={17} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" prefetch={!localPreview} aria-label="Soma Home">
          <SomaLogo />
        </Link>
        <nav className="mobile-header-nav" aria-label="Primary mobile navigation">
          {activeMobileNavigation.map(({ label, href, icon: Icon }) => (
            <Link
              href={href}
              prefetch={!localPreview}
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

      <div key={pathname} className="main-content">{children}</div>
    </div>
  );
}
