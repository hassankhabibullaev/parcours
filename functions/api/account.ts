/**
 * Username + password accounts, backed by the same Workers KV namespace as sync.
 *
 * The account record lives at KV key `acct:<username>` and stores a PBKDF2 hash
 * of the password (never the password itself) plus the display name. This is a
 * real credential check — sign-up refuses a taken username, log-in refuses a
 * wrong password — but the threat model is modest: the data behind an account is
 * non-sensitive learning progress, and the sync bucket is still reached by a
 * (separately derived) code. The password gates the login UX and account
 * ownership, not the bucket contents.
 *
 * POST /api/account  { action: 'signup' | 'login', username, password, name? }
 *   → 200 { ok: true, name }
 *   → 4xx { ok: false, error }
 *
 * A dev mirror of this handler lives in vite.config.ts (Pages Functions don't
 * run under `vite dev`); keep the two in step.
 */

interface Env {
  SYNC_KV: KVNamespace;
}

interface AccountRecord {
  name: string;
  salt: string; // hex
  hash: string; // hex, PBKDF2(password, salt)
  createdAt: number;
}

const PBKDF2_ITERATIONS = 100_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

// Constant-time-ish compare so a wrong hash can't be timed byte-by-byte.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeUsername(u: unknown): string {
  return typeof u === 'string' ? u.trim().toLowerCase() : '';
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { action?: string; username?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }

  const action = body.action;
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return json(
      { ok: false, error: 'Username must be 3–32 characters: letters, numbers, . _ -' },
      400,
    );
  }
  if (password.length < 6) {
    return json({ ok: false, error: 'Password must be at least 6 characters.' }, 400);
  }

  const kvKey = `acct:${username}`;

  if (action === 'signup') {
    const existing = await env.SYNC_KV.get(kvKey);
    if (existing) {
      return json({ ok: false, error: 'That username is taken. Try logging in.' }, 409);
    }
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(password, salt);
    const record: AccountRecord = {
      name: name || username,
      salt,
      hash,
      createdAt: Date.now(),
    };
    await env.SYNC_KV.put(kvKey, JSON.stringify(record));
    return json({ ok: true, name: record.name });
  }

  if (action === 'login') {
    const raw = await env.SYNC_KV.get(kvKey);
    if (!raw) {
      return json({ ok: false, error: 'No account for that username. Sign up first.' }, 404);
    }
    const record = JSON.parse(raw) as AccountRecord;
    const hash = await hashPassword(password, record.salt);
    if (!safeEqual(hash, record.hash)) {
      return json({ ok: false, error: 'Wrong username or password.' }, 401);
    }
    return json({ ok: true, name: record.name });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
};
