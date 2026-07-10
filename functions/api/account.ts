/**
 * Email + one-time-code (OTP) accounts, backed by the same Workers KV
 * namespace as sync. One unified flow for new and returning learners:
 *
 *   POST /api/account { action: 'request-code', email }
 *     → generates a 6-digit code, stores its hash at `otp:<email>` (10 min TTL,
 *       5 attempts) and emails it. → 200 { ok: true }
 *   POST /api/account { action: 'verify-code', email, code }
 *     → checks the code; on success creates the account record at
 *       `acct:<email>` if it doesn't exist yet (sign-up and log-in are the
 *       same action). → 200 { ok: true, name, created }
 *
 * Email delivery goes through Resend (https://resend.com) when the
 * RESEND_API_KEY env var / secret is configured (optional OTP_FROM overrides
 * the sender). Without a key — fresh deploys, previews — the endpoint stays
 * functional by returning the code in the response (`devCode`) so sign-in
 * still works; the client shows it inline. The data behind an account is
 * non-sensitive learning progress, so this fallback is an accepted trade-off
 * until a mail key is added. Configure the secret with:
 *   npx wrangler pages secret put RESEND_API_KEY --project-name=parcours
 *
 * A dev mirror of this handler lives in vite.config.ts (Pages Functions don't
 * run under `vite dev`); keep the two in step.
 */

interface Env {
  SYNC_KV: KVNamespace;
  RESEND_API_KEY?: string;
  OTP_FROM?: string;
}

interface AccountRecord {
  email: string;
  name: string;
  createdAt: number;
}

interface OtpRecord {
  hash: string; // hex SHA-256 of `${email}:${code}`
  tries: number;
  expiresAt: number;
}

const OTP_TTL_SECONDS = 600; // codes live 10 minutes
const OTP_MAX_TRIES = 5;
const OTP_REQUEST_CAP = 5; // codes per email per window
const OTP_REQUEST_WINDOW_SECONDS = 900;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashCode(email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${email}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

// Constant-time-ish compare so a wrong hash can't be timed byte-by-byte.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeEmail(e: unknown): string {
  return typeof e === 'string' ? e.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Coarse per-IP throttle: this endpoint is unauthenticated and can send mail,
// so cap it before doing any work. KV is eventually consistent, so this is a
// soft limit — enough for the modest threat model; Cloudflare's edge absorbs
// volumetric floods. The dev mirror in vite.config.ts omits it (local only).
const RL_MAX_PER_WINDOW = 20;
const RL_WINDOW_SECONDS = 60;

async function isRateLimited(env: Env, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const count = Number((await env.SYNC_KV.get(key)) ?? 0);
  if (count >= max) return true;
  await env.SYNC_KV.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return false;
}

/**
 * The code email's HTML body — mirrors the app's newspaper-desk aesthetic
 * (cream paper, burgundy "P" seal, serif wordmark, tabular-nums code card).
 * Table-based layout + inline styles throughout: Gmail/Outlook strip <style>
 * blocks and ignore flexbox/grid, so nothing here can rely on either.
 */
function otpEmailHtml(code: string): string {
  return `
<div style="background:#f0ece3;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;">
    <tr>
      <td align="center" style="padding-bottom:28px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;">
              <div style="width:34px;height:34px;border-radius:8px;background:#b5503a;text-align:center;line-height:34px;font-family:Georgia,'Times New Roman',serif;color:#f7f1e6;font-size:18px;font-weight:700;">P</div>
            </td>
            <td>
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;letter-spacing:0.08em;color:#211d16;text-transform:uppercase;">Parcours</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:#faf7f0;border:1px solid #ddd5c5;border-radius:10px;padding:32px 28px;">
        <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.3;color:#211d16;">
          Your sign-in code
        </p>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#6b6255;">
          Enter this in Parcours to sign in. It expires in 10 minutes.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="background:#f0ece3;border:1px solid #ddd5c5;border-radius:10px;padding:18px 12px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;letter-spacing:0.35em;color:#211d16;font-variant-numeric:tabular-nums;">
                ${code}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#8a8172;">
          Didn't request this? You can safely ignore this email — no account changes without the code.
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:22px;">
        <span style="font-size:12px;color:#a39c8c;">Parcours · your French, one edition at a time</span>
      </td>
    </tr>
  </table>
</div>`.trim();
}

/** Send the code via Resend; returns false when no provider is configured. */
async function sendCodeEmail(env: Env, email: string, code: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.OTP_FROM ?? 'Parcours <onboarding@resend.dev>',
      to: [email],
      subject: `${code} is your Parcours sign-in code`,
      text:
        `Your Parcours sign-in code is: ${code}\n\n` +
        `It expires in 10 minutes. If you didn't request it, you can ignore this email.`,
      html: otpEmailHtml(code),
    }),
  });
  return res.ok;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (await isRateLimited(env, `rl:acct:${ip}`, RL_MAX_PER_WINDOW, RL_WINDOW_SECONDS)) {
    return json({ ok: false, error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  let body: { action?: string; email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }

  const action = body.action;
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  }

  const otpKey = `otp:${email}`;

  if (action === 'request-code') {
    if (
      await isRateLimited(env, `otpreq:${email}`, OTP_REQUEST_CAP, OTP_REQUEST_WINDOW_SECONDS)
    ) {
      return json(
        { ok: false, error: 'Too many codes requested. Please wait a few minutes.' },
        429,
      );
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const record: OtpRecord = {
      hash: await hashCode(email, code),
      tries: 0,
      expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
    };
    await env.SYNC_KV.put(otpKey, JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS });
    const sent = await sendCodeEmail(env, email, code).catch(() => false);
    // No mail provider configured: hand the code back so sign-in still works.
    return sent ? json({ ok: true }) : json({ ok: true, devCode: code });
  }

  if (action === 'verify-code') {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) {
      return json({ ok: false, error: 'Enter the 6-digit code from the email.' }, 400);
    }
    const raw = await env.SYNC_KV.get(otpKey);
    const record = raw ? (JSON.parse(raw) as OtpRecord) : null;
    if (!record || record.expiresAt < Date.now()) {
      return json({ ok: false, error: 'That code has expired — request a new one.' }, 400);
    }
    if (record.tries >= OTP_MAX_TRIES) {
      await env.SYNC_KV.delete(otpKey);
      return json({ ok: false, error: 'Too many wrong attempts — request a new code.' }, 429);
    }
    if (!safeEqual(record.hash, await hashCode(email, code))) {
      record.tries += 1;
      const ttl = Math.max(60, Math.ceil((record.expiresAt - Date.now()) / 1000));
      await env.SYNC_KV.put(otpKey, JSON.stringify(record), { expirationTtl: ttl });
      return json({ ok: false, error: 'Wrong code — check the email and try again.' }, 401);
    }
    await env.SYNC_KV.delete(otpKey);

    // Same action signs up and logs in: create the account on first verify.
    const acctKey = `acct:${email}`;
    const existing = await env.SYNC_KV.get(acctKey);
    if (existing) {
      const account = JSON.parse(existing) as AccountRecord;
      return json({ ok: true, name: account.name ?? '', created: false });
    }
    const account: AccountRecord = { email, name: '', createdAt: Date.now() };
    await env.SYNC_KV.put(acctKey, JSON.stringify(account));
    return json({ ok: true, name: '', created: true });
  }

  return json({ ok: false, error: 'Unknown action.' }, 400);
};
