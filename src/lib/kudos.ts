/**
 * Kudos — send a short thank-you note from a signed-in learner to the
 * developer's inbox. POST /api/kudos (functions/api/kudos.ts, mirrored for
 * `vite dev` in vite.config.ts) checks the email has an account and relays the
 * note by email through the same Resend setup as the sign-in codes.
 */

export const KUDOS_MAX_LENGTH = 280; // keep in step with functions/api/kudos.ts

/** Relay the note; throws with the server's message so the UI can show it. */
export async function sendKudos(email: string, message: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/kudos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, message }),
    });
  } catch {
    throw new Error('Could not reach the server — check your connection and try again.');
  }
  let data: { ok?: boolean; error?: string } = {};
  try {
    data = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? 'Something went wrong. Please try again.');
  }
}
