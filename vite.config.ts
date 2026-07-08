import { fileURLToPath, URL } from "node:url";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function resolveReleaseId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // No .git available (some CI/container contexts) — package.json
    // version is the fallback, not silently "no release at all".
    const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
    return `v${pkg.version}`;
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_RELEASE__: JSON.stringify(resolveReleaseId()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon-32.png", "favicon-48.png", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "AadesiPo — The Telugu property game",
        short_name: "AadesiPo",
        description:
          "A property game for the Telugu states — buy, build, and bankrupt your friends. Play vs AI, pass-and-play, or online. No sign-up, works offline.",
        theme_color: "#121726",
        background_color: "#121726",
        display: "standalone",
        orientation: "portrait",
        // Installed app opens straight to the game setup, not the marketing page.
        start_url: "/play",
        scope: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        // Cache-first shell so the app opens instantly on repeat visits;
        // realtime game data always goes over the network regardless.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@aadesipo/engine": fileURLToPath(new URL("./packages/engine/src", import.meta.url)),
    },
  },
});
