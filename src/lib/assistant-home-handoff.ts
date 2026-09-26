const KEY = "soma:home-assistant-message";
const MAX_AGE_MS = 2 * 60_000;

export function saveHomeAssistantMessage(text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 4_000) return false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ text: clean, createdAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function consumeHomeAssistantMessage() {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const message = value as { text?: unknown; createdAt?: unknown };
    if (typeof message.text !== "string" || typeof message.createdAt !== "number") return null;
    if (Date.now() - message.createdAt > MAX_AGE_MS || message.createdAt > Date.now() || message.text.length > 4_000) return null;
    return message.text.trim() || null;
  } catch {
    return null;
  }
}
