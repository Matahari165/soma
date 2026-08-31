import type { Metadata } from "next";

import MealJournal from "@/components/meal-journal";
import { PublicHome } from "@/components/public-home";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function MealsPage() {
  if (!(await getCurrentUser())) return <PublicHome />;
  return <div id="main-page-content"><MealJournal /></div>;
}
