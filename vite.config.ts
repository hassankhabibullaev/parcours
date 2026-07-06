import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
