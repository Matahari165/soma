import { Suspense } from "react";

import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { LabWorldPreview } from "@/components/lab/lab-world-preview";
import { createPersonalLabStream } from "@/services/personal-lab";

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  const stream = createPersonalLabStream(user, { periods: [90], includeAnalysis: false });
  return <Suspense fallback={<div id="main-page-content" className="lab-world-loading" role="status">Chargement du laboratoire…</div>}><LabWorldPreview stream={stream} /></Suspense>;
}
