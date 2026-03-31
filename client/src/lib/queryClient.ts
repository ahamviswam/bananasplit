import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { handleMemoryRequest } from "./memoryStore";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ── Backend detection (runs once, all callers share the same promise) ─────────
let _backendCheckPromise: Promise<boolean> | null = null;

function checkBackend(): Promise<boolean> {
  if (_backendCheckPromise) return _backendCheckPromise;
  _backendCheckPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/groups`, {
        signal: AbortSignal.timeout(1500),
      });
      // Must be a real 200 OK with a JSON array — not a 404 HTML page from GitHub
      if (!res.ok) return false;
      const text = await res.text();
      // Only trust it if the response looks like a JSON array (our API returns [])
      return text.trim().startsWith('[') || text.trim().startsWith('{');
    } catch {
      return false; // fetch failed/timeout → no backend → use memory
    }
  })();
  return _backendCheckPromise;
}

// ── Memory response adapter ───────────────────────────────────────────────────
function memoryResponse(method: string, path: string, body?: any): Response {
  try {
    const data = handleMemoryRequest(method, path, body);
    const isDelete = method === "DELETE";
    const status = isDelete ? 204 : method === "POST" ? 201 : 200;
    return new Response(
      isDelete ? null : JSON.stringify(data),
      { status, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ message: err.message || "Error" }),
      { status: err.status || 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// ── apiRequest ────────────────────────────────────────────────────────────────
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const hasBackend = await checkBackend();

  if (!hasBackend) {
    const res = memoryResponse(method, url, data);
    if (method !== "DELETE") await throwIfResNotOk(res.clone());
    return res;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  if (method !== "DELETE") await throwIfResNotOk(res);
  return res;
}

// ── apiFetch (for queryFn usage) ──────────────────────────────────────────────
export async function apiFetch(path: string): Promise<any> {
  const hasBackend = await checkBackend();
  if (!hasBackend) {
    const res = memoryResponse("GET", path);
    await throwIfResNotOk(res.clone());
    return await res.clone().json();
  }
  const res = await fetch(`${API_BASE}${path}`);
  await throwIfResNotOk(res);
  return await res.json();
}

// ── Default query function ────────────────────────────────────────────────────
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const pathParts = queryKey.filter(
      (k) => typeof k === "string" || typeof k === "number"
    );
    const path = pathParts.join("/");

    const hasBackend = await checkBackend();

    if (!hasBackend) {
      const res = memoryResponse("GET", path);
      if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
      await throwIfResNotOk(res.clone());
      return await res.clone().json();
    }

    const res = await fetch(`${API_BASE}${path}`);
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

// ── QueryClient ───────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
