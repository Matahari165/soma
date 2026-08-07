"use client";

import {
  Activity,
  BarChart3,
  BedDouble,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CoachChat } from "@/components/coach-chat";

const navigation = [
  { label: "Today", href: "/", icon: LayoutDashboard },
  { label: "Sleep", href: "/sleep", icon: BedDouble },
  { label: "Recovery", href: "/recovery", icon: HeartPulse },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Trends", href: "/trends", icon: BarChart3 },
  { label: "Coach", href: "/coach", icon: MessageCircle },
];

const mobileNavigation = navigation.slice(0, 4);

function SomaMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function CoachPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="coach-panel" aria-label="Soma Coach panel">
      <div className="coach-panel__header">
        <div>
          <span className="eyebrow">Soma Coach</span>
          <h2>Ask about your day</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close coach">
          <X size={20} />
        </button>
      </div>

      <CoachChat compact />
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [coachOpen, setCoachOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (
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
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="brand" href="/" aria-label="Soma home">
          <SomaMark />
          <span>Soma</span>
        </Link>

        <nav className="sidebar-nav">
          <p className="nav-label">Overview</p>
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link
              className={isActive(href) ? "nav-link nav-link--active" : "nav-link"}
              href={href}
              key={href}
              aria-current={isActive(href) ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-secondary">
          <Link className="nav-link" href="/workouts">
            <Dumbbell size={19} strokeWidth={1.8} />
            <span>Workouts</span>
          </Link>
          <Link className="nav-link" href="/settings">
            <Settings size={19} strokeWidth={1.8} />
            <span>Settings</span>
          </Link>
        </div>

        <button className="profile-card" type="button" aria-label="Open profile settings">
          <span className="avatar">JD</span>
          <span>
            <strong>Jeremy</strong>
            <small>Personal beta</small>
          </span>
          <Menu size={17} />
        </button>
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" aria-label="Soma home">
          <SomaMark />
          <span>Soma</span>
        </Link>
        <div className="mobile-header__actions">
          <button className="icon-button" type="button" onClick={() => setCoachOpen(true)} aria-label="Open Soma Coach">
            <Sparkles size={19} />
          </button>
          <button className="icon-button" type="button" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Open menu" aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <nav className="mobile-menu" aria-label="Additional navigation">
          {navigation.slice(4).map(({ label, href, icon: Icon }) => (
            <Link href={href} key={href} className="nav-link" onClick={() => setMobileMenuOpen(false)}>
              <Icon size={19} />
              {label}
            </Link>
          ))}
          <Link href="/workouts" className="nav-link" onClick={() => setMobileMenuOpen(false)}><Dumbbell size={19} />Workouts</Link>
          <Link href="/settings" className="nav-link" onClick={() => setMobileMenuOpen(false)}><Settings size={19} />Settings</Link>
        </nav>
      )}

      <main className="main-content">{children}</main>

      <button className="coach-fab" type="button" onClick={() => setCoachOpen(true)} aria-label="Open Soma Coach">
        <Sparkles size={20} />
        <span>Ask Soma</span>
      </button>

      <nav className="bottom-nav" aria-label="Mobile primary navigation">
        {mobileNavigation.map(({ label, href, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={isActive(href) ? "bottom-nav__link bottom-nav__link--active" : "bottom-nav__link"}
            aria-current={isActive(href) ? "page" : undefined}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
        <button type="button" className="bottom-nav__link" onClick={() => setMobileMenuOpen((value) => !value)}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {coachOpen && (
        <>
          <button className="panel-backdrop" type="button" onClick={() => setCoachOpen(false)} aria-label="Close coach panel" />
          <CoachPanel onClose={() => setCoachOpen(false)} />
        </>
      )}
    </div>
  );
}
