import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setAuthToken, setGuestMode, queryClient } from "@/lib/queryClient";
import { getGuestStartedAt, startGuestSession, isGuestExpired, guestDaysLeft, GUEST_TRIAL_DAYS } from "@/lib/guestMode";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  isAdmin?: boolean;
}

const GUEST_TOKEN = "guest-local-token";
const GUEST_USER: AuthUser = { id: 1, email: "guest@pickletab.local", name: "Guest" };

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isGuest: boolean;
  guestExpired: boolean;
  guestDaysLeft: number | null;
  startGuest: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, token: null,
  login: async () => {}, register: async () => {}, logout: () => {},
  isLoading: true,
  isGuest: false, guestExpired: false, guestDaysLeft: null,
  startGuest: async () => {},
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
const IS_CAPACITOR = window.location.protocol === "capacitor:" || window.location.protocol === "ionic:" || (window as any).Capacitor !== undefined;
const RAILWAY_URL = "https://bananasplit-production.up.railway.app";
const API_BASE = "__PORT_5000__".startsWith("__")
  ? (IS_LOCAL && !IS_CAPACITOR ? "" : RAILWAY_URL)
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
  const [isGuest, setIsGuest] = useState(false);
  const [guestExpired, setGuestExpired] = useState(false);
  const [guestDaysLeftState, setGuestDaysLeftState] = useState<number | null>(null);

  const activateGuest = useCallback((startedAt: number) => {
    setGuestMode(true);
    setAuthToken(GUEST_TOKEN);
    setToken(GUEST_TOKEN);
    setUser(GUEST_USER);
    setIsGuest(true);
    setGuestExpired(false);
    setGuestDaysLeftState(guestDaysLeft(startedAt));
  }, []);

  // Restore session on mount — a real logged-in session always wins over a
  // guest trial; only fall back to checking guest state if there's no
  // real session saved on this device.
  useEffect(() => {
    (async () => {
      const saved = loadAuth();
      if (saved) {
        setToken(saved.token);
        setUser(saved.user);
        setAuthToken(saved.token); // restore in-memory token immediately
        setIsLoading(false);
        return;
      }
      const startedAt = await getGuestStartedAt();
      if (startedAt !== null) {
        if (isGuestExpired(startedAt)) {
          setIsGuest(true);
          setGuestExpired(true);
          setGuestDaysLeftState(0);
        } else {
          activateGuest(startedAt);
        }
      }
      setIsLoading(false);
    })();
  }, [activateGuest]);

  const startGuest = useCallback(async () => {
    const startedAt = await startGuestSession();
    activateGuest(startedAt);
  }, [activateGuest]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authFetch("/api/auth/login", { email, password });
    setGuestMode(false);
    setIsGuest(false);
    setGuestExpired(false);
    setToken(data.token);
    setUser(data.user);
    saveAuth(data.token, data.user);
    setAuthToken(data.token);  // immediately available to all API calls
    queryClient.invalidateQueries(); // clear any stale cache
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const data = await authFetch("/api/auth/register", { email, name, password });
    setGuestMode(false);
    setIsGuest(false);
    setGuestExpired(false);
    setToken(data.token);
    setUser(data.user);
    saveAuth(data.token, data.user);
    setAuthToken(data.token);  // immediately available to all API calls
    queryClient.invalidateQueries();
  }, []);

  const logout = useCallback(() => {
    setGuestMode(false);
    setIsGuest(false);
    setGuestExpired(false);
    setToken(null);
    setUser(null);
    clearAuth();
    setAuthToken(null);  // clear in-memory token
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, login, register, logout, isLoading,
      isGuest, guestExpired, guestDaysLeft: guestDaysLeftState, startGuest,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
