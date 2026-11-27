import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cleaningLandingPrerenderPlugin } from "./vite-plugins/cleaning-landing-prerender-plugin";
import { homePrerenderPlugin } from "./vite-plugins/home-prerender-plugin";
import { privacyPolicyPrerenderPlugin } from "./vite-plugins/privacy-prerender-plugin";

export default defineConfig({
  plugins: [homePrerenderPlugin(), cleaningLandingPrerenderPlugin(), privacyPolicyPrerenderPlugin(), react()],
  server: {
    host: "0.0.0.0",
    port: 8085,
  },
  build: {
    assetsDir: "marketing-assets",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        cleaningLanding: resolve(__dirname, "software-empresas-limpieza/index.html"),
        privacyPolicy: resolve(__dirname, "privacidad/index.html"),
      },
    },
  },
});
