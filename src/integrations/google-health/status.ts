export type GoogleHealthNotice = {
  message: string;
  tone: "success" | "error" | "neutral";
};

const notices: Record<string, GoogleHealthNotice> = {
  connected: {
    message: "Google Health is connected. Your first import has started in the background.",
    tone: "success",
  },
  permission_denied: {
    message: "Google Health permission was not granted. Your Soma profile is saved, and you can connect whenever you are ready.",
    tone: "neutral",
  },
  invalid_state: {
    message: "This Google Health connection link expired or was interrupted. Start the connection again.",
    tone: "error",
  },
  connection_failed: {
    message: "Google Health could not be connected. No health data was imported. Try the connection again.",
    tone: "error",
  },
  unavailable: {
    message: "Google Health is temporarily unavailable. Your Soma profile is saved. Try the connection again in a moment.",
    tone: "error",
  },
};

export function getGoogleHealthNotice(status: string | undefined) {
  return status ? notices[status] ?? null : null;
}
