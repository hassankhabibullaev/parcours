import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Honor an externally assigned port (e.g. the preview harness) but keep 5173 by default.
  const { PORT } = loadEnv(mode, ".", "");
  return {
    server: PORT ? { port: Number(PORT) } : undefined,
    plugins: [
      react(),
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
