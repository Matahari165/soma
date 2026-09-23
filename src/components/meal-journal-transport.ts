import type { MealEntryState } from "@/domain/meals";
import {
  apiMealToRecord,
  MEAL_SLOTS,
  randomId,
  type AnalyzeMealInput,
  type MealJournalData,
  type MealOrigin,
  type MealPhoto,
  type MealRecord,
  type Rating,
} from "@/domain/meal-record";
import {
  classifyMealClientError,
  fetchMealWithTimeout,
  MEAL_ANALYSIS_REQUEST_TIMEOUT_MS,
  MEAL_ANALYSIS_STATUS_TIMEOUT_MS,
} from "@/services/meal-client";
import { recordAnalysisToApi } from "./meal-journal-logic";

export type MealAnalysisProgress = {
  phase?: string;
  dishType?: string;
  foods: string[];
};

export async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.error === "string" ? body.error : "Meals are currently unavailable.");
    Object.assign(error, { code: typeof body?.code === "string" ? body.code : "UNKNOWN_ANALYSIS_ERROR", requestId: typeof body?.requestId === "string" ? body.requestId : response.headers.get("X-Analysis-Request-Id") });
    throw error;
  }
  return body;
}

export async function defaultLoad(date: string) {
  const response = await fetchMealWithTimeout(`/api/meals?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`, { cache: "no-store" }, 15_000, { operation: "load" });
  const body = await readJson(response) as { meals?: unknown[] };
  const meals = Array.isArray(body.meals) ? body.meals.map(apiMealToRecord) : [];
  return { date, meals: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, meals.find((meal) => meal.slot === slot) ?? null])) } as MealJournalData;
}

export async function defaultLoadAnalysisStatus(mealId: string) {
  const response = await fetchMealWithTimeout(
    `/api/meals/${encodeURIComponent(mealId)}/analyze`,
    { cache: "no-store" },
    MEAL_ANALYSIS_STATUS_TIMEOUT_MS,
    { operation: "load" },
  );
  return await readJson(response) as { meal?: unknown };
}

export async function defaultSetPhotoOrigin(mealId: string, photoId: string, origin: MealOrigin) {
  const response = await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/photos/${encodeURIComponent(photoId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin }) }, 15_000, { operation: "update" });
  await readJson(response);
}

type UploadedPhotoPair = { localPhotoId: string; photo: MealPhoto };

type DefaultAnalyzeOptions = {
  onMealCreated?: (mealId: string) => void;
  onPhotosUploaded?: (photos: UploadedPhotoPair[]) => void;
  onProgress?: (progress: MealAnalysisProgress) => void;
};

export async function defaultAnalyze({ date, slot, meal, files, photoFiles, correction }: AnalyzeMealInput, options: DefaultAnalyzeOptions = {}) {
  const hasPhotoEvidence = files.length > 0 || (meal.status !== "confirmed" && meal.photos.some((photo) => (photo.storageStatus ?? "available") === "available"));
  const hasTextEvidence = Boolean(meal.note.trim());
  const hasCorrection = Boolean(correction?.trim());
  if (!hasPhotoEvidence && !hasTextEvidence && !hasCorrection) throw new Error("Add a photo or a description of the meal before starting analysis.");
  const analysisRequestId = randomId("analysis");
  let mealId = meal.id;
  const isNewMeal = mealId.startsWith("meal-");
  if (isNewMeal) {
    const createResponse = await fetchMealWithTimeout("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: date, mealType: slot, status: "draft", entryState: "recorded", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
    }, 15_000, { operation: "create", requestId: analysisRequestId });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
    options.onMealCreated?.(mealId);
  }
  const uploadEntries = photoFiles?.length
    ? photoFiles
      .map(({ photoId, file }) => ({ photo: meal.photos.find((candidate) => candidate.id === photoId), file }))
      .filter((entry): entry is { photo: MealPhoto; file: File } => Boolean(entry.photo))
    : meal.photos.flatMap((photo) => {
      const file = filesByFilename(files, photo.filename);
      return file ? [{ photo, file }] : [];
    });
  if (!isNewMeal) {
    await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: meal.note.trim().slice(0, 500), entryState: "recorded" }) }, 15_000, { operation: "update", requestId: analysisRequestId }));
    await Promise.all(meal.photos.filter((photo) => !photo.id.startsWith("photo-") && photo.comment != null).map(async (photo) =>
      readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/photos/${encodeURIComponent(photo.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: photo.comment }) }, 15_000, { operation: "update", requestId: analysisRequestId })),
    ));
  }
  if (files.length > 0) {
    const uploadFiles = uploadEntries.map((entry) => entry.file);
    const origins = uploadEntries.map((entry) => entry.photo.origin ?? "unknown");
    if (uploadFiles.length !== files.length) throw new Error("Selected photos no longer match the meal.");
    for (const [index, entry] of uploadEntries.entries()) {
      const file = uploadFiles[index];
      if (file.size > 4 * 1024 * 1024) throw new Error("Cette photo est trop lourde pour l’envoi. Choisis une photo plus légère.");
      const form = new FormData();
      form.set("origin", origins[index]);
      form.set("comment_0", entry.photo.comment ?? "");
      form.append("photos", file, file.name);
      const uploadKey = `meal-${mealId}-photo-${entry.photo.id}`;
      const uploadedBody = await readJson(await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/photos`, { method: "POST", headers: { "Idempotency-Key": uploadKey }, body: form }, 60_000, { operation: "upload", requestId: analysisRequestId })) as { photos?: MealPhoto[] };
      if (!Array.isArray(uploadedBody.photos) || uploadedBody.photos.length !== 1) throw new Error("The server did not confirm the photo for the meal.");
      options.onPhotosUploaded?.([{ localPhotoId: entry.photo.id, photo: uploadedBody.photos[0] }]);
    }
  }
  const response = await fetchMealWithTimeout(`/api/meals/${encodeURIComponent(mealId)}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Analysis-Request-Id": analysisRequestId,
      "Idempotency-Key": analysisRequestId
    },
    body: JSON.stringify({
      stream: false,
      force: Boolean(correction || meal.analysis),
      idempotencyKey: analysisRequestId,
      ...(correction ? { correction } : {})
    })
  }, MEAL_ANALYSIS_REQUEST_TIMEOUT_MS, { operation: "analyze", requestId: analysisRequestId });

  if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentProgress: MealAnalysisProgress = { phase: "Connexion…", foods: [] as string[], dishType: undefined };
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "phase") {
                const phasesMap: Record<string, string> = {
                  "starting": "Préparation des photos…",
                  "downloading_photos": "Préparation des photos…",
                  "reasoning": "Réflexion nutritionnelle…",
                  "analyzing": "Analyse du repas…",
                  "validating": "Validation des données…",
                  "finalizing": "Enregistrement…"
                };
                currentProgress = { ...currentProgress, phase: phasesMap[data.phase] || "Analyse en cours…" };
                options.onProgress?.(currentProgress);
              } else if (currentEvent === "dish_detected") {
                currentProgress = { ...currentProgress, dishType: data.dishType, phase: `Plat : ${data.dishType}` };
                options.onProgress?.(currentProgress);
              } else if (currentEvent === "food_detected") {
                if (!currentProgress.foods.includes(data.food)) {
                  currentProgress = { ...currentProgress, phase: "Identification des aliments…", foods: [...currentProgress.foods, data.food] };
                  options.onProgress?.(currentProgress);
                }
              } else if (currentEvent === "complete") {
                return apiMealToRecord(data.meal);
              } else if (currentEvent === "error") {
                throw new Error(data.error || "L’analyse a échoué.");
              }
            } catch (e) {
              if (currentEvent === "error") throw e;
            }
          }
        }
      }
    } catch (readError) {
      // If the stream is interrupted (network glitch, client timeout, or disconnect),
      // verify if the server completed the analysis in the background before failing.
      try {
        const statusRes = await fetchMealWithTimeout(
          `/api/meals/${encodeURIComponent(mealId)}/analyze`,
          { cache: "no-store" },
          5_000,
          { operation: "load" }
        );
        const statusBody = await readJson(statusRes) as { meal?: unknown };
        if (statusBody?.meal) {
          return apiMealToRecord(statusBody.meal);
        }
      } catch {
        // Fall through to throw classified error
      }
      throw classifyMealClientError(readError, "analyze", analysisRequestId);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released
      }
    }
  }

  const body = await readJson(response);
  if (response.status === 202 || body?.queued) {
    options.onProgress?.({ phase: "Analyse en cours…", foods: [] });
    for (let attempt = 0; attempt < 45; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
      const statusResponse = await fetchMealWithTimeout(
        `/api/meals/${encodeURIComponent(mealId)}/analyze`,
        { cache: "no-store", headers: { "X-Analysis-Request-Id": analysisRequestId } },
        MEAL_ANALYSIS_STATUS_TIMEOUT_MS,
        { operation: "load", requestId: analysisRequestId },
      );
      const statusBody = await readJson(statusResponse);
      if (statusBody?.analysis?.status === "failed") throw new Error(statusBody.analysis.error || "L’analyse du repas a échoué.");
      if (statusBody?.analysis?.status === "completed" && statusBody.meal) return apiMealToRecord(statusBody.meal);
    }
    throw new Error("L’analyse se poursuit. Réessaie dans un instant pour voir le résultat enregistré.");
  }
  if (!body || typeof body.meal !== "object" || body.meal === null) throw new Error("The server did not return the analyzed meal.");
  return apiMealToRecord(body.meal);
}

export async function defaultSave(meal: MealRecord) {
  let mealId = meal.id;
  if (mealId.startsWith("meal-")) {
    const createResponse = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: meal.date, mealType: meal.slot, status: "draft", entryState: meal.entryState ?? "recorded", ...(meal.note.trim() ? { note: meal.note.trim().slice(0, 500) } : {}) }),
    });
    const created = await readJson(createResponse) as { meal: { id: string } };
    mealId = created.meal.id;
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    status: "confirmed",
    entryState: meal.entryState ?? "recorded",
    note: meal.note.trim().slice(0, 500),
    mouthWarmthIntensity: serializeRating(meal.mouthHeat),
    stomachOverfullIntensity: serializeRating(meal.stomachLoad),
    ...(meal.analysis ? { confirmedAnalysis: recordAnalysisToApi(meal.analysis) } : {}),
  }) });
  const body = await readJson(response);
  return body.meal ? apiMealToRecord(body.meal) : meal;
}

/** Persist an explicit slot state without creating nutrition or AI evidence. */
export async function defaultSetEntryState(meal: MealRecord, entryState: MealEntryState) {
  if (meal.id.startsWith("meal-")) {
    const response = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": meal.id },
      body: JSON.stringify({ mealDate: meal.date, mealType: meal.slot, entryState }),
    });
    const body = await readJson(response) as { meal?: unknown };
    if (!body.meal || typeof body.meal !== "object") throw new Error("The slot status could not be saved.");
    const saved = apiMealToRecord(body.meal);
    return { ...saved, note: meal.note, photos: meal.photos, analysis: meal.analysis };
  }
  const response = await fetch(`/api/meals/${encodeURIComponent(meal.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryState }),
  });
  const body = await readJson(response) as { meal?: unknown };
  if (!body.meal || typeof body.meal !== "object") throw new Error("The slot status could not be saved.");
  return apiMealToRecord(body.meal);
}

export async function defaultRemovePhoto(mealId: string, photoId: string) {
  await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }));
}

export async function defaultRemoveMeal(mealId: string) {
  await readJson(await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "DELETE" }));
}

function filesByFilename(files: File[], filename?: string) {
  return filename ? files.find((file) => file.name === filename) : undefined;
}

function serializeRating(value: Rating | null) {
  return value === null ? null : value === 0 ? "none" : value;
}
