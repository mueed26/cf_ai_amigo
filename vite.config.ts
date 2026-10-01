import path from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import agents from "agents/vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    agents(),
    react(),
    cloudflare(),
    tailwindcss(),
    // `npm run dev:https` serves https://localhost:5173 with a self-signed
    // certificate, because Slack only allows its login on https.
    ...(mode === "https" ? [basicSsl()] : [])
  ],
  // "@/..." points at src/, same as the original AMIGO AI app.
  resolve: { alias: { "@": path.resolve(__dirname, "src") } }
}));
