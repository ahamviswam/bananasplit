import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { handleMemoryRequest } from "./memoryStore";

// When running locally (dev server), use relative paths.
// When deployed on GitHub Pages (no backend), point to Railway.
const IS_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const RAILWAY_URL = "https://bananasplit-production.up.railway.app";
const API_BASE = "__PORT_5000__".startsWith("__")
  ? (IS_LOCAL ? "" : RAILWAY_URL)  // GitHub Pages → use Railway backend
  : "__PORT_5000__";                // Deployed with real server → use proxy

// ── Backend detection (runs once, all callers share the same promise) ─────────
let _backendCheckPromise: Promise<boolean> | null = null;

function checkBackend(): Promise<boolean> {
  if (_backendCheckPromise) return _backendCheckPromise;
  _backendCheckPromise = (async () => {
    // When pointing at Railway directly, always use backend (skip detection)
    if (API_BASE === RAILWAY_URL) return true;
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return false;
      const text = await res.text();
      return text.includes('"ok"');
    } catch {
      return false;
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

// ── Auth token helper ────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  let token: string | null = null;
  try { token = sessionStorage.getItem("bs_auth_token") || localStorage.getItem("bs_auth_token"); } catch {}
  return token ? { "Authorization": `Bearer ${token}` } : {};
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
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
    },
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
  const res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() });
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
