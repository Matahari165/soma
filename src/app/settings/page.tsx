import type { Metadata } from "next";

import { SettingsConsole } from "@/components/settings-console";
import { getGoogleHealthNotice } from "@/integrations/google-health/status";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ health?: string | string[] }> }) {
  const params = await searchParams;
  const healthStatus = Array.isArray(params.health) ? params.health[0] : params.health;
  return <SettingsConsole initialHealthNotice={getGoogleHealthNotice(healthStatus)} />;
}
