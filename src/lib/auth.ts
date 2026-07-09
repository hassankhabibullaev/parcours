/**
 * Username + password identity. Credentials are verified by the account backend
 * (functions/api/account.ts, mirrored for `vite dev` in vite.config.ts): sign-up
 * refuses a taken username, log-in refuses a wrong password. The threat model is
 * modest — the data behind an account is non-sensitive learning progress — but
 * this is a real login, not the old unverified email label.
 *
 * The identity lives in localStorage (the session persists indefinitely until an
 * explicit sign-out). The sync bucket key is a hash of the username, so the
 * account progress travels under an opaque code, not the raw name.
 */

import { db, setKV } from './db';
import { syncNow } from './sync';

export interface User {
  name: string;
  username: string;
}

const USER_KEY = 'parcours-user';

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    if (!parsed.username) return null;
    return { name: parsed.name ?? '', username: parsed.username };
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

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Usernames: 3–32 chars, letters/numbers plus . _ - (matches the backend). */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeUsername(username));
}

export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}

/**
 * A stable, opaque sync-bucket key from the username. Hashed so the name never
 * appears in the `/api/sync/:code` URL or the server's KV keys.
 */
export async function deriveSyncCode(username: string): Promise<string> {
  const data = new TextEncoder().encode(`parcours:${normalizeUsername(username)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `acct-${hex.slice(0, 32)}`;
}

interface AccountResponse {
  ok?: boolean;
  name?: string;
  error?: string;
}

/** Thrown for a rejected credential so the UI can show the server's message. */
export class AuthError extends Error {}

async function postAccount(
  action: 'signup' | 'login',
  fields: { username: string; password: string; name?: string },
): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...fields, username: normalizeUsername(fields.username) }),
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
  return data.name ?? normalizeUsername(fields.username);
}

/** Finish a successful auth: remember the identity, point sync at the bucket, pull. */
async function establishSession(name: string, username: string): Promise<User> {
  const user: User = { name: name.trim() || normalizeUsername(username), username: normalizeUsername(username) };
  storeUser(user);
  await setKV('syncCode', await deriveSyncCode(user.username));
  // Name rides along in the synced store so other devices show it too.
  await setKV('accountName', user.name);
  await syncNow();
  return user;
}

/** Create a new account, then sign in. */
export async function signUp(name: string, username: string, password: string): Promise<User> {
  const resolvedName = await postAccount('signup', { username, password, name });
  return establishSession(name || resolvedName, username);
}

/** Verify credentials for an existing account, then sign in. */
export async function logIn(username: string, password: string): Promise<User> {
  const name = await postAccount('login', { username, password });
  return establishSession(name, username);
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
