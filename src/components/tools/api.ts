// Tiny fetch wrapper for the tools endpoints: JSON in, JSON out, readable errors.
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (res.redirected && new URL(res.url).pathname === "/login") throw new Error("Signed out. Reload the page and sign in.");
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    if (!res.ok) throw new Error(`Server error (${res.status}). Check the terminal running the hub.`);
    throw new Error("Unexpected response from the server.");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

/** Saves a URL (same-origin or blob:) through a temporary <a download>. */
export function saveAs(href: string, name?: string) {
  const a = document.createElement("a");
  a.href = href;
  if (name !== undefined) a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
