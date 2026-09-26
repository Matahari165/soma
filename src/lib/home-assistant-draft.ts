const KEY = "soma:home-assistant-draft";
const MAX_AGE_MS = 30 * 60_000;
export const HOME_ASSISTANT_MAX_LENGTH = 4_000;

export function saveHomeAssistantDraft(text: string) {
  try {
    if (!text) sessionStorage.removeItem(KEY);
    else if (text.length <= HOME_ASSISTANT_MAX_LENGTH) sessionStorage.setItem(KEY, JSON.stringify({ text, savedAt: Date.now() }));
  } catch {
    // The mounted composer preserves the draft when storage is unavailable.
  }
}

export function readHomeAssistantDraft() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && "text" in value && "savedAt" in value
      && typeof value.text === "string" && value.text.length <= HOME_ASSISTANT_MAX_LENGTH
      && typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
      && value.savedAt <= Date.now() && Date.now() - value.savedAt <= MAX_AGE_MS) return value.text;
    sessionStorage.removeItem(KEY);
  } catch {
    // A corrupt or inaccessible browser draft is treated as absent.
  }
  return null;
}
