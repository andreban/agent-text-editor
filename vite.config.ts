import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@mast-ai/google-genai": path.resolve(
        __dirname,
        "../mast-ai/packages/google-genai/dist/index.js",
      ),
    },
  },
});
