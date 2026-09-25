import { Capacitor } from "@capacitor/core";

// Guest trial tracking.
//
// On iOS, the start timestamp is written to the Keychain, which survives app
// deletion — so reinstalling doesn't grant a fresh trial. Android has no
// equivalent OS-level storage that survives uninstall (by design, for
// privacy), so Android and web fall back to localStorage, which does reset
// on uninstall/clear-data. This is a known, accepted gap on Android.

const GUEST_KEY = "pt_guest_started_at";
export const GUEST_TRIAL_DAYS = 4;
const TRIAL_MS = GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000;

async function secureGet(key: string): Promise<string | null> {
  if (Capacitor.getPlatform() === "ios") {
    try {
      const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
      const result = await SecureStoragePlugin.get({ key });
      return typeof result === "string" ? result : (result as any)?.value ?? null;
    } catch {
      // Not found, or plugin unavailable — fall through to localStorage below.
    }
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Capacitor.getPlatform() === "ios") {
    try {
      const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
      await SecureStoragePlugin.set({ key, value });
    } catch {
      // Fall through — localStorage below still records it for this install.
    }
  }
  try { localStorage.setItem(key, value); } catch {}
}

export async function getGuestStartedAt(): Promise<number | null> {
  const raw = await secureGet(GUEST_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Idempotent — if a trial is already recorded (e.g. from before an uninstall
 *  on iOS), returns its original start time rather than resetting the clock. */
export async function startGuestSession(): Promise<number> {
  const existing = await getGuestStartedAt();
  if (existing !== null) return existing;
  const now = Date.now();
  await secureSet(GUEST_KEY, String(now));
  return now;
}

export function isGuestExpired(startedAt: number): boolean {
  return Date.now() - startedAt >= TRIAL_MS;
}

export function guestDaysLeft(startedAt: number): number {
  const msLeft = TRIAL_MS - (Date.now() - startedAt);
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}
