import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: { absolute: "Soma" } };

export default async function MealRecipesPage() {
  redirect("/meals");
}
