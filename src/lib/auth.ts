/**
 * Lightweight, password-less identity. The email is not verified — it is simply
 * the key that ties a learner's progress to a cloud bucket, so signing in with
 * the same address on any device restores and keeps that progress in sync. No
 * sensitive data is involved (it's reading/vocabulary progress), so this is the
 * same trust model the old device-sync codes used, minus the code-shuffling.
 *
 * The identity lives in localStorage (the session persists indefinitely until an
 * explicit sign-out); the bucket key is a hash of the email, so the raw address
 * never travels in a URL or reaches the sync server.
 */

import { db, setKV } from './db';
import { syncNow } from './sync';

export interface User {
  name: string;
  email: string;
}

const USER_KEY = 'parcours-user';

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    if (!parsed.email) return null;
    return { name: parsed.name ?? '', email: parsed.email };
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

/**
 * Sign in: remember the identity locally, point sync at this email's bucket, and
 * pull down whatever progress is already stored there (merged last-write-wins
 * with anything on this device).
 */
export async function signIn(name: string, email: string): Promise<User> {
  const user: User = { name: name.trim(), email: normalizeEmail(email) };
  storeUser(user);
  await setKV('syncCode', await deriveSyncCode(user.email));
  // Name rides along in the synced store so other devices show it too.
  await setKV('accountName', user.name);
  await syncNow();
  return user;
}

/**
 * Sign out: push any last local changes to the cloud, then wipe the device's
 * local store so the next sign-in (this account or another) starts from a clean
 * slate — no data bleeds between accounts on a shared device, and this account's
 * progress is safe in its bucket, returning on the next sign-in.
 */
export async function signOut(): Promise<void> {
  try {
    await syncNow();
  } catch {
    /* offline — local wipe still proceeds; the cloud keeps the last sync */
  }
  clearStoredUser();
  await db.delete();
  await db.open();
}
