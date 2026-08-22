import type { Metadata } from "next";

import { DiscoveriesExplorer } from "@/components/lab/discoveries-explorer";
import { requireCurrentUser } from "@/lib/auth";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

export const metadata: Metadata = { title: "Analyses" };

export default async function TrendsPage() {
  const user = await requireCurrentUser();
  return <DiscoveriesExplorer data={await getPersonalLabSnapshot(user)} />;
}
