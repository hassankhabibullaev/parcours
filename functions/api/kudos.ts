/**
 * Kudos — a signed-in learner's short thank-you note, relayed by email to the
 * developer's inbox:
 *
 *   POST /api/kudos { email, message }
 *     → verifies the email belongs to a registered account (`acct:<email>` in
 *       KV), then emails the note to KUDOS_TO via Resend. → 200 { ok: true }
 *
 * Delivery reuses the sign-in code setup: the RESEND_API_KEY secret and the
 * OTP_FROM sender (functions/api/account.ts documents both). Unlike the OTP
 * endpoint there is no fallback when mail can't be sent — the note either
 * arrives or the caller gets an error to show.
 *
 * "Signed in" here is as strong as the app's session model: the client holds
 * `{ email }` in localStorage, so the server can only check that the address
 * has an account, not that the caller owns it. Worst case is a fake-attributed
 * compliment to the developer, capped by the rate limits below — proportionate
 * to the stakes.
 *
 * A dev mirror of this handler lives in vite.config.ts (Pages Functions don't
 * run under `vite dev`); keep the two in step.
 */

interface Env {
  SYNC_KV: KVNamespace;
  RESEND_API_KEY?: string;
  OTP_FROM?: string;
}

const KUDOS_TO = 'khassanboi@gmail.com';
const KUDOS_MAX_LENGTH = 280; // keep in step with src/lib/kudos.ts
const KUDOS_CAP = 3; // notes per email per window
const KUDOS_WINDOW_SECONDS = 3600;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function normalizeEmail(e: unknown): string {
  return typeof e === 'string' ? e.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// The message is learner input headed into an HTML email — escape it.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Coarse per-IP throttle, same shape as the account endpoint's: this endpoint
// is cheap to call and sends mail, so cap it before doing any work.
const RL_MAX_PER_WINDOW = 20;
const RL_WINDOW_SECONDS = 60;

async function isRateLimited(env: Env, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const count = Number((await env.SYNC_KV.get(key)) ?? 0);
  if (count >= max) return true;
  await env.SYNC_KV.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return false;
}

/**
 * The note's HTML body — same newspaper-desk template as the sign-in code
 * email (cream paper, burgundy "P" seal, serif wordmark). Table-based layout +
 * inline styles throughout: Gmail/Outlook strip <style> blocks and ignore
 * flexbox/grid, so nothing here can rely on either.
 */
function kudosEmailHtml(email: string, message: string): string {
  const body = escapeHtml(message).replace(/\n/g, '<br>');
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
          Kudos from a learner
        </p>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#6b6255;">
          ${escapeHtml(email)} sent you a note from Settings.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#f0ece3;border:1px solid #ddd5c5;border-radius:10px;padding:18px 16px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;color:#211d16;">
                ${body}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#8a8172;">
          Reply to this email to answer them directly.
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

/** Relay the note via Resend; returns false when unconfigured or rejected. */
async function sendKudosEmail(env: Env, email: string, message: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.OTP_FROM ?? 'Parcours <onboarding@resend.dev>',
      to: [KUDOS_TO],
      reply_to: email,
      subject: `Kudos from ${email}`,
      text: `${email} sent you kudos from Parcours:\n\n${message}`,
      html: kudosEmailHtml(email, message),
    }),
  });
  return res.ok;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (await isRateLimited(env, `rl:kudos:${ip}`, RL_MAX_PER_WINDOW, RL_WINDOW_SECONDS)) {
    return json({ ok: false, error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  let body: { email?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Bad request.' }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return json({ ok: false, error: 'Sign in with your email to send kudos.' }, 400);
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return json({ ok: false, error: 'Write a few words first.' }, 400);
  }
  if (message.length > KUDOS_MAX_LENGTH) {
    return json({ ok: false, error: `Keep it under ${KUDOS_MAX_LENGTH} characters.` }, 400);
  }

  if (!(await env.SYNC_KV.get(`acct:${email}`))) {
    return json({ ok: false, error: 'Sign in with your email to send kudos.' }, 403);
  }

  if (await isRateLimited(env, `kudoscap:${email}`, KUDOS_CAP, KUDOS_WINDOW_SECONDS)) {
    return json({ ok: false, error: 'You’ve sent a few already — merci ! Try again in an hour.' }, 429);
  }

  const sent = await sendKudosEmail(env, email, message).catch(() => false);
  if (!sent) {
    return json({ ok: false, error: 'Could not send right now. Please try again later.' }, 502);
  }
  return json({ ok: true });
};
