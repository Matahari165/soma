"use client";

import {
  Activity,
  BedDouble,
  BookOpen,
  HeartPulse,
  LayoutDashboard,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { useDialogLayer } from "@/components/use-dialog-layer";
import { SomaLogo } from "@/components/soma-logo";
import type { SomaUser } from "@/lib/auth";

const PanelCoachChat = dynamic(() => import("@/components/coach-chat").then((module) => module.CoachChat), { ssr: false, loading: () => <div className="coach-loading" role="status">Opening Coach…</div> });

const navigation = [
  { label: "Lab", href: "/", icon: LayoutDashboard },
  { label: "Repas", href: "/meals", icon: Utensils },
  { label: "Recettes", href: "/meal-recipes", icon: BookOpen },
  { label: "Sleep", href: "/sleep", icon: BedDouble },
  { label: "Recovery", href: "/recovery", icon: HeartPulse },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Coach", href: "/coach", icon: MessageCircle },
];

// The logo is the home affordance and Coach keeps its dedicated panel action.
// Show the remaining product destinations directly on mobile instead of hiding
// them behind a second menu.
const mobileNavigation = navigation.filter(({ href }) => href !== "/" && href !== "/coach");

function CoachPanel({ onClose, panelRef }: { onClose: () => void; panelRef: React.RefObject<HTMLElement | null> }) {
  return (
    <aside ref={panelRef} className="coach-panel" role="dialog" aria-modal="true" aria-labelledby="coach-panel-title">
      <div className="coach-panel__header">
        <div>
          <span className="eyebrow">Soma Coach</span>
          <h2 id="coach-panel-title">Ask about your day</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close coach">
          <X size={20} />
        </button>
      </div>

      <PanelCoachChat compact />
    </aside>
  );
}

export function AppShell({ children, user, localPreview = false }: { children: React.ReactNode; user: SomaUser | null; localPreview?: boolean }) {
  const pathname = usePathname();
  const [coachOpen, setCoachOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const coachPanelRef = useRef<HTMLElement>(null);
  const closeCoach = useCallback(() => setCoachOpen(false), []);
  const displayName = user?.displayName ?? "Soma user";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
  const onCoachPage = pathname.startsWith("/coach");

  useDialogLayer({ open: coachOpen, onClose: closeCoach, containerRef: coachPanelRef });

  if (
    ((pathname === "/" || pathname.startsWith("/meals") || pathname.startsWith("/meal-recipes")) && !user) ||
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
    <div className={["app-shell", localPreview && "app-shell--preview", sidebarCollapsed && "app-shell--sidebar-collapsed"].filter(Boolean).join(" ")}>
      <aside id="primary-sidebar" className={sidebarCollapsed ? "sidebar sidebar--collapsed" : "sidebar"} aria-label="Primary navigation">
        <div className="sidebar__header">
          <Link className="brand" href="/" aria-label="Soma home">
            <SomaLogo compact={sidebarCollapsed} />
          </Link>
        </div>

        <nav className="sidebar-nav">
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link
              className={isActive(href) ? "nav-link nav-link--active" : "nav-link"}
              href={href}
              key={href}
              aria-current={isActive(href) ? "page" : undefined}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
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
          <Link className={isActive("/settings") ? "profile-card profile-card--active" : "profile-card"} href="/settings" aria-label={`Open settings for ${displayName}`} title={sidebarCollapsed ? `Open settings for ${displayName}` : undefined}>
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
        <Link className="brand" href="/" aria-label="Soma home">
          <SomaLogo />
        </Link>
        <nav className="mobile-header-nav" aria-label="Mobile primary navigation">
          {mobileNavigation.map(({ label, href, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={isActive(href) ? "mobile-header-nav__link mobile-header-nav__link--active" : "mobile-header-nav__link"}
              aria-current={isActive(href) ? "page" : undefined}
              aria-label={label}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <div className="mobile-header__actions">
          {!onCoachPage && <button className="icon-button" type="button" onClick={() => setCoachOpen(true)} aria-label="Open Soma Coach">
            <MessageCircle size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>}
        </div>
      </header>

      <main className="main-content">{children}</main>

      {coachOpen && (
        <>
          <button className="panel-backdrop" type="button" onClick={() => setCoachOpen(false)} aria-label="Close coach panel" />
          <CoachPanel onClose={closeCoach} panelRef={coachPanelRef} />
        </>
      )}
    </div>
  );
}
