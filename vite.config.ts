import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

// Standalone config (no Lovable wrapper).
// - tanstackStart: server entry redirected to src/server.ts (SSR error wrapper)
// - cloudflare: Workers build, uses wrangler.jsonc
export default defineConfig(({ command }) => ({
  server: { port: 8080 },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    command === "build" ? cloudflare({ viteEnvironment: { name: "ssr" } }) : null,
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      // Server-only modules referenced from *.functions.ts are stripped from
      // handlers by the compiler; mock any leftover client references.
      importProtection: { behavior: "mock" },
    }),
    viteReact(),
  ].filter(Boolean),
}));
