/**
 * Pronunciation proxy for Parcours.
 *
 * The client cannot hit Google Translate's TTS endpoint directly: WebKit refuses
 * the cross-origin media in iOS Safari and (worse) the Home-Screen PWA, so the
 * app fell silent there. Fetching the MP3 server-side — where there is no CORS or
 * referrer barrier — and streaming it back SAME-ORIGIN is what makes the audio
 * element play on every platform. Responses are cached because words repeat.
 *
 * Google's `translate_tts` returns a natural French voice (same one every time),
 * which also fixes the desktop "robotic on the first tap" wobble that came from
 * the old speechSynthesis fallback firing before its voices had loaded.
 */

type Ctx = { request: Request };

const MAX_Q = 200; // Google's translate_tts caps the query length.

export const onRequestGet = async ({ request }: Ctx): Promise<Response> => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, MAX_Q).trim();
  const tl = url.searchParams.get('tl') ?? 'fr-FR';
  if (!q) return new Response('missing q', { status: 400 });

  const upstream =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
    `&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      // Google serves the clip to browser-like clients; a bare fetch gets 403.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
    });
  } catch {
    return new Response('upstream error', { status: 502 });
  }
  if (!res.ok || !res.body) return new Response('upstream error', { status: 502 });

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      // Words repeat constantly; let the browser and CDN keep the clip.
      'Cache-Control': 'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
