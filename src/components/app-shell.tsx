"use client";

import {
  Activity,
  BedDouble,
  FlaskConical,
  HeartPulse,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
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
  { label: "Lab", href: "/", icon: FlaskConical },
  { label: "Sleep", href: "/sleep", icon: BedDouble },
  { label: "Recovery", href: "/recovery", icon: HeartPulse },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Coach", href: "/coach", icon: MessageCircle },
];

const mobileNavigation = navigation.slice(0, 4);

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const coachPanelRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const closeCoach = useCallback(() => setCoachOpen(false), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const displayName = user?.displayName ?? "Soma user";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
  const onCoachPage = pathname.startsWith("/coach");

  useDialogLayer({ open: coachOpen, onClose: closeCoach, containerRef: coachPanelRef });
  useDialogLayer({ open: mobileMenuOpen, onClose: closeMobileMenu, containerRef: mobileMenuRef });

  if (
    (pathname === "/" && !user) ||
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
        <div className="mobile-header__actions">
          {!onCoachPage && <button className="icon-button" type="button" onClick={() => setCoachOpen(true)} aria-label="Open Soma Coach">
            <MessageCircle size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>}
          <button className="icon-button" type="button" onClick={() => setMobileMenuOpen((value) => !value)} aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen} aria-controls="mobile-more-menu">
            {mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <><button className="mobile-menu-backdrop" type="button" onClick={closeMobileMenu} aria-label="Dismiss menu" /><nav ref={mobileMenuRef} id="mobile-more-menu" className="mobile-menu" aria-label="Additional navigation" role="dialog" aria-modal="true">
          {navigation.slice(4).map(({ label, href, icon: Icon }) => (
            <Link href={href} key={href} className={isActive(href) ? "nav-link nav-link--active" : "nav-link"} aria-current={isActive(href) ? "page" : undefined} onClick={closeMobileMenu}>
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          ))}
          <Link href="/settings" className={isActive("/settings") ? "nav-link nav-link--active" : "nav-link"} aria-current={isActive("/settings") ? "page" : undefined} onClick={closeMobileMenu}><Settings size={19} aria-hidden="true" />Settings</Link>
        </nav></>
      )}

      <main className="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="Mobile primary navigation">
        {mobileNavigation.map(({ label, href, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={isActive(href) ? "bottom-nav__link bottom-nav__link--active" : "bottom-nav__link"}
            aria-current={isActive(href) ? "page" : undefined}
            onClick={closeMobileMenu}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <button type="button" className={mobileMenuOpen || isActive("/coach") || isActive("/settings") ? "bottom-nav__link bottom-nav__link--active" : "bottom-nav__link"} onClick={() => setMobileMenuOpen((value) => !value)} aria-label={mobileMenuOpen ? "Close more navigation" : "Open more navigation"} aria-expanded={mobileMenuOpen} aria-controls="mobile-more-menu">
          <Menu size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {coachOpen && (
        <>
          <button className="panel-backdrop" type="button" onClick={() => setCoachOpen(false)} aria-label="Close coach panel" />
          <CoachPanel onClose={closeCoach} panelRef={coachPanelRef} />
        </>
      )}
    </div>
  );
}
