import type { Metadata } from "next";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { requireCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up Soma" };

export default async function OnboardingPage() {
  const user = await requireCurrentUser();
  return <OnboardingForm initialDisplayName={user.displayName} />;
}
