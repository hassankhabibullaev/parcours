import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Account API (functions/api/account.ts) is a Cloudflare Pages Function, so it
 * never runs under `vite dev`. This middleware mirrors it with an in-memory
 * store (resets on restart) so sign-up / log-in work locally. Keep it in step
 * with functions/api/account.ts. Uses only web-standard globals (the same
 * `crypto.subtle` as the Function) so it needs no Node type packages.
 */
function devAccountApi(): Plugin {
  interface Rec { name: string; salt: string; hash: string }
  const accounts = new Map<string, Rec>();
  const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const fromHex = (h: string) => {
    const o = new Uint8Array(h.length / 2);
    for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return o;
  };
  const hashPassword = async (password: string, saltHex: string) => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromHex(saltHex), iterations: 100_000, hash: "SHA-256" },
      key,
      256,
    );
    return toHex(new Uint8Array(bits));
  };
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
          void (async () => {
            let body: { action?: string; username?: string; password?: string; name?: string } = {};
            try {
              body = JSON.parse(raw || "{}");
            } catch {
              return send(400, { ok: false, error: "Bad request." });
            }
            const username = (body.username ?? "").trim().toLowerCase();
            const password = body.password ?? "";
            const name = (body.name ?? "").trim();
            if (!/^[a-z0-9._-]{3,32}$/.test(username))
              return send(400, {
                ok: false,
                error: "Username must be 3–32 characters: letters, numbers, . _ -",
              });
            if (password.length < 6)
              return send(400, { ok: false, error: "Password must be at least 6 characters." });
            if (body.action === "signup") {
              if (accounts.has(username))
                return send(409, { ok: false, error: "That username is taken. Try logging in." });
              const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
              const hash = await hashPassword(password, salt);
              accounts.set(username, { name: name || username, salt, hash });
              return send(200, { ok: true, name: name || username });
            }
            if (body.action === "login") {
              const rec = accounts.get(username);
              if (!rec)
                return send(404, { ok: false, error: "No account for that username. Sign up first." });
              if ((await hashPassword(password, rec.salt)) !== rec.hash)
                return send(401, { ok: false, error: "Wrong username or password." });
              return send(200, { ok: true, name: rec.name });
            }
            return send(400, { ok: false, error: "Unknown action." });
          })();
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
