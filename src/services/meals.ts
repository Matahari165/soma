import "server-only";

export { MealServiceError, computeMealSourceFingerprint } from "./meals-shared";
export { deleteMeal, createMeal, updateMealRecord } from "./meals-crud";
export {
  loadMealPhotoForAnalysis,
  addMealPhotos,
  updateMealPhotoOrigins,
  updateMealPhotoOrigin,
  updateMealPhotoDetails,
  removeMealPhoto,
  reconcileMealPhotoPurges,
  reconcileAbandonedMealPhotoUploads,
  purgeExpiredFailedAnalysisPhotos,
} from "./meals-photos";
export {
  finalizeMealAnalysis,
  enqueueMealAnalysis,
  requeueRetryableMealAnalyses,
  processNextMealAnalysis,
  analyzeMeal,
} from "./meals-analysis";
export { loadConfirmedMealRecords } from "./meals-records";
export { findMeal, findMealPhoto, listMealPhotos, listMeals } from "@/repositories/meals";
