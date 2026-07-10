/**
 * Email + one-time-code identity. One unified flow: the learner enters their
 * email, receives a 6-digit code (functions/api/account.ts, mirrored for
 * `vite dev` in vite.config.ts), and verifying it signs them in — creating the
 * account on the spot if it's their first time. No passwords anywhere.
 *
 * The identity lives in localStorage (the session persists indefinitely until
 * an explicit sign-out). The sync bucket key is a hash of the email, so the
 * account progress travels under an opaque code, not the raw address.
 */

import { db, setKV } from './db';
import { syncNow } from './sync';

export interface User {
  email: string;
  name?: string;
}

const USER_KEY = 'parcours-user';

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User> & { username?: string };
    // Legacy sessions (username + password era) stored { name, username }.
    // Keep them signed in under the same identifier so their sync bucket
    // (derived from that string) still matches.
    const email = parsed.email ?? parsed.username;
    if (!email) return null;
    return { email, name: parsed.name || undefined };
  } catch {
    return null;
  }
}

function storeUser(user: User): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — the sign-in still works for this session */
  }
}

function clearStoredUser(): void {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

/**
 * A stable, opaque sync-bucket key from the email. Hashed so the address never
 * appears in the `/api/sync/:code` URL or the server's KV keys.
 */
export async function deriveSyncCode(email: string): Promise<string> {
  const data = new TextEncoder().encode(`parcours:${normalizeEmail(email)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `acct-${hex.slice(0, 32)}`;
}

interface AccountResponse {
  ok?: boolean;
  name?: string;
  created?: boolean;
  /** Present when the server has no mail provider configured (and always in dev). */
  devCode?: string;
  error?: string;
}

/** Thrown for a rejected request so the UI can show the server's message. */
export class AuthError extends Error {}

async function postAccount(payload: Record<string, string>): Promise<AccountResponse> {
  let res: Response;
  try {
    res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthError('Could not reach the server — check your connection and try again.');
  }
  let data: AccountResponse = {};
  try {
    data = (await res.json()) as AccountResponse;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !data.ok) {
    throw new AuthError(data.error ?? 'Something went wrong. Please try again.');
  }
  return data;
}

/**
 * Ask the server to email a sign-in code. Returns the code itself when email
 * delivery isn't configured (dev, or no mail key yet) so the UI can show it.
 */
export async function requestCode(email: string): Promise<{ devCode?: string }> {
  const data = await postAccount({ action: 'request-code', email: normalizeEmail(email) });
  return { devCode: data.devCode };
}

/**
 * Verify the emailed code. Creates the account if this email has none (one
 * form serves both sign-up and log-in), then establishes the local session.
 */
export async function verifyCode(email: string, code: string): Promise<User> {
  const data = await postAccount({
    action: 'verify-code',
    email: normalizeEmail(email),
    code: code.trim(),
  });
  const user: User = { email: normalizeEmail(email), name: data.name || undefined };
  storeUser(user);
  await setKV('syncCode', await deriveSyncCode(user.email));
  await syncNow();
  return user;
}

/**
 * Sign out: push any last local changes to the cloud, then wipe the device's
 * local store so the next session (guest, this account, or another) starts from a
 * clean slate — no data bleeds between accounts on a shared device, and this
 * account's progress is safe in its bucket, returning on the next sign-in.
 *
 * We clear every table rather than `db.delete()` because the app stays mounted
 * after sign-out (it drops to guest mode, not a sign-in wall): the live queries
 * on the still-mounted page hold the database open and would block a delete.
 * Clearing wipes the same data and updates those queries reactively to empty.
 */
export async function signOut(): Promise<void> {
  try {
    await syncNow();
  } catch {
    /* offline — local wipe still proceeds; the cloud keeps the last sync */
  }
  clearStoredUser();
  await Promise.all([
    db.savedWords.clear(),
    db.articleProgress.clear(),
    db.practiceResults.clear(),
    db.kv.clear(),
    db.lookupCache.clear(),
    db.tombstones.clear(),
    db.drillStats.clear(),
  ]);
}
