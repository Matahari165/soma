import type { Metadata } from "next";

import { SettingsConsole } from "@/components/settings-console";
import { getDataMode } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsConsole demoMode={getDataMode() === "demo"} />;
}
