import { Suspense } from "react";

import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";
import { LabWorldPreview } from "@/components/lab/lab-world-preview";
import { createPersonalLabStream } from "@/services/personal-lab";

async function TodayPageContent() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome />;

  const stream = createPersonalLabStream(user, { periods: [90], includeAnalysis: false });
  return <LabWorldPreview stream={stream} />;
}

export default function TodayPage() {
  return <Suspense fallback={<div id="main-page-content" className="lab-world-loading" role="status" aria-live="polite" aria-label="Chargement du laboratoire">Chargement du laboratoire…</div>}><TodayPageContent /></Suspense>;
}
