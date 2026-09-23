import "server-only";

import type { ConfirmedMealRecord } from "@/domain/lab/meals";
import { listMeals } from "@/repositories/meals";
import { confirmedMealRecordFor } from "@/services/meal-analysis-records";

export async function loadConfirmedMealRecords(userId: string, options: { from?: string; to?: string } = {}): Promise<ConfirmedMealRecord[]> {
  const meals = await listMeals(userId, { ...options, preferLatestCompletedAnalysis: true });
  return meals.flatMap((meal) => {
    const record = confirmedMealRecordFor(meal);
    return record ? [record] : [];
  });
}
