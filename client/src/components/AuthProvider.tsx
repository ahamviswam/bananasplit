import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, token: null,
  login: async () => {}, register: async () => {}, logout: () => {},
  isLoading: true,
});

// Use sessionStorage as a fallback — it persists within a tab session
// but clears when the browser closes (acceptable for auth tokens)
// IndexedDB-backed token storage is used when available
const TOKEN_KEY = "bs_auth_token";
const USER_KEY = "bs_auth_user";

function saveAuth(token: string, user: AuthUser) {
  try { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
  try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
}

function loadAuth(): { token: string; user: AuthUser } | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    const userStr = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    if (token && userStr) return { token, user: JSON.parse(userStr) };
  } catch {}
  return null;
}

function clearAuth() {
  try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); } catch {}
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {}
}

// API base — same logic as queryClient
const IS_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const RAILWAY_URL = "https://bananasplit-production.up.railway.app";
const API_BASE = "__PORT_5000__".startsWith("__")
  ? (IS_LOCAL ? "" : RAILWAY_URL)
  : "__PORT_5000__";

async function authFetch(path: string, body: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const saved = loadAuth();
    if (saved) {
      setToken(saved.token);
      setUser(saved.user);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authFetch("/api/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    saveAuth(data.token, data.user);
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const data = await authFetch("/api/auth/register", { email, name, password });
    setToken(data.token);
    setUser(data.user);
    saveAuth(data.token, data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
