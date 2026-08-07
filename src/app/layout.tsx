import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";

import "./globals.css";
import "./product-flows.css";

export const metadata: Metadata = {
  title: {
    default: "Soma — Understand your health",
    template: "%s · Soma",
  },
  description: "Personal health insights from your sleep, recovery, and activity data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f4ef",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-page-content">Skip to content</a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
