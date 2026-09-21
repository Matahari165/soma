import type { Metadata } from "next";

import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function AssistantPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  return <AssistantWorkspace />;
}
