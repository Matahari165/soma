import "server-only";

type AssistantDatabaseOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
  fetchImpl?: typeof fetch;
};

function assistantDatabaseConfiguration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Assistant database is not configured.");
  return { url, serviceRoleKey };
}

export async function assistantDatabaseRequest<T>(path: string, options: AssistantDatabaseOptions = {}): Promise<T> {
  if (!path || path.startsWith("http") || path.includes("..")) throw new Error("Invalid assistant database path.");
  const { url, serviceRoleKey } = assistantDatabaseConfiguration();
  const headers = new Headers({
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    accept: "application/json",
  });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);

  const response = await (options.fetchImpl ?? fetch)(`${url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`Assistant database operation failed (${response.status})${requestId ? ` [${requestId}]` : ""}.`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function assistantFilter(value: string) {
  return encodeURIComponent(value);
}
