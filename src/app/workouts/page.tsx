import type { Metadata } from "next";

import { WorkoutStudio } from "@/components/workout-studio";

export const metadata: Metadata = { title: "Workouts" };

export default function WorkoutsPage() {
  return <WorkoutStudio />;
}
