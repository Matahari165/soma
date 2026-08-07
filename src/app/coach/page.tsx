import type { Metadata } from "next";

import { CoachWorkspace } from "@/components/coach-workspace";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return <CoachWorkspace />;
}
