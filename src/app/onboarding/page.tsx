import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { requireCurrentUser } from "@/lib/auth";
import { hasCompletedOnboarding } from "@/lib/cloudflare/session";
import { isLocalPreviewMode } from "@/lib/env";

export const metadata: Metadata = { title: "Set up Soma" };

export default async function OnboardingPage() {
  const user = await requireCurrentUser();
  if (!isLocalPreviewMode() && await hasCompletedOnboarding(user.id)) redirect("/");
  return <OnboardingForm initialDisplayName={user.displayName} />;
}
