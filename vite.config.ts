import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Account API (functions/api/account.ts) is a Cloudflare Pages Function, so it
 * never runs under `vite dev`. This middleware mirrors the email + OTP flow
 * with an in-memory store (resets on restart) so sign-in works locally. No
 * mail is ever sent in dev — the code always comes back as `devCode` (and is
 * printed to the terminal). Keep it in step with functions/api/account.ts.
 */
function devAccountApi(): Plugin {
  const accounts = new Map<string, { name: string }>();
  const codes = new Map<string, { code: string; tries: number; expiresAt: number }>();
  return {
    name: "dev-account-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const r = req as {
          url?: string;
          method?: string;
          on: (event: string, cb: (chunk?: unknown) => void) => void;
        };
        if (r.url !== "/api/account" || r.method !== "POST") return next();
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        let raw = "";
        r.on("data", (chunk) => {
          raw += chunk;
        });
        r.on("end", () => {
          let body: { action?: string; email?: string; code?: string } = {};
          try {
            body = JSON.parse(raw || "{}");
          } catch {
            return send(400, { ok: false, error: "Bad request." });
          }
          const email = (body.email ?? "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
            return send(400, { ok: false, error: "Enter a valid email address." });
          if (body.action === "request-code") {
            const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
            codes.set(email, { code, tries: 0, expiresAt: Date.now() + 600_000 });
            server.config.logger.info(`[dev-account] sign-in code for ${email}: ${code}`);
            return send(200, { ok: true, devCode: code });
          }
          if (body.action === "verify-code") {
            const rec = codes.get(email);
            if (!rec || rec.expiresAt < Date.now())
              return send(400, { ok: false, error: "That code has expired — request a new one." });
            if (rec.tries >= 5) {
              codes.delete(email);
              return send(429, { ok: false, error: "Too many wrong attempts — request a new code." });
            }
            if ((body.code ?? "").trim() !== rec.code) {
              rec.tries += 1;
              return send(401, { ok: false, error: "Wrong code — check the email and try again." });
            }
            codes.delete(email);
            const created = !accounts.has(email);
            if (created) accounts.set(email, { name: "" });
            return send(200, { ok: true, name: accounts.get(email)!.name, created });
          }
          return send(400, { ok: false, error: "Unknown action." });
        });
      });
    },
  };
}

/**
 * Kudos relay (functions/api/kudos.ts) is a Cloudflare Pages Function, so it
 * never runs under `vite dev`. This middleware accepts the POST, prints the
 * note to the terminal instead of emailing it (no mail in dev), and skips the
 * account-exists check (the dev account store lives inside devAccountApi).
 * Keep it in step with functions/api/kudos.ts.
 */
function devKudosApi(): Plugin {
  return {
    name: "dev-kudos-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const r = req as {
          url?: string;
          method?: string;
          on: (event: string, cb: (chunk?: unknown) => void) => void;
        };
        if (r.url !== "/api/kudos" || r.method !== "POST") return next();
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        let raw = "";
        r.on("data", (chunk) => {
          raw += chunk;
        });
        r.on("end", () => {
          let body: { email?: string; message?: string } = {};
          try {
            body = JSON.parse(raw || "{}");
          } catch {
            return send(400, { ok: false, error: "Bad request." });
          }
          const email = (body.email ?? "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
            return send(400, { ok: false, error: "Sign in with your email to send kudos." });
          const message = (body.message ?? "").trim();
          if (!message) return send(400, { ok: false, error: "Write a few words first." });
          if (message.length > 280)
            return send(400, { ok: false, error: "Keep it under 280 characters." });
          server.config.logger.info(`[dev-kudos] from ${email}: ${message}`);
          return send(200, { ok: true });
        });
      });
    },
  };
}

/**
 * The pronunciation proxy (functions/api/tts.ts) is a Cloudflare Pages Function,
 * so it never runs under `vite dev` — the request would fall through to the SPA
 * and the audio element would error, dropping the app to the robotic
 * speechSynthesis voice. This middleware reproduces the Function in dev so the
 * local site speaks with the same natural Google voice as production.
 */
function devTtsProxy(): Plugin {
  return {
    name: "dev-tts-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqUrl = (req as { url?: string }).url ?? "";
        if (!reqUrl.startsWith("/api/tts")) return next();
        const url = new URL(reqUrl, "http://localhost");
        const q = (url.searchParams.get("q") ?? "").slice(0, 200).trim();
        const tl = url.searchParams.get("tl") ?? "fr-FR";
        if (!q) {
          res.statusCode = 400;
          res.end("missing q");
          return;
        }
        const upstream =
          "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob" +
          `&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;
        try {
          const r = await fetch(upstream, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Referer: "https://translate.google.com/",
            },
          });
          if (!r.ok || !r.body) {
            res.statusCode = 502;
            res.end("upstream error");
            return;
          }
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          res.end(new Uint8Array(await r.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.end("upstream error");
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Honor an externally assigned port (e.g. the preview harness) but keep 5173 by default.
  const { PORT } = loadEnv(mode, ".", "");
  return {
    server: PORT ? { port: Number(PORT) } : undefined,
    plugins: [
      react(),
      devTtsProxy(),
      devAccountApi(),
      devKudosApi(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/apple-touch-icon.png"],
        manifest: {
          name: "Parcours",
          short_name: "Parcours",
          description:
            "A French-learning desk: reading, vocabulary and conjugation with one shared memory.",
          lang: "en",
          display: "standalone",
          background_color: "#F5F0E6",
          theme_color: "#F5F0E6",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
  };
});
