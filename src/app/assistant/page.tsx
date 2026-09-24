import type { Metadata } from "next";

import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function AssistantPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  return <AssistantWorkspace previewMode={isLocalPreviewMode()} />;
}
