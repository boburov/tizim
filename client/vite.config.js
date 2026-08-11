// Path module
import path from "path";

// Vite
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Xatoni tashxislash uchun: `SOURCEMAP=true npm run build`.
    //
    // Standart holatda O'CHIQ - .map fayli manba kodni ochiq qoldiradi.
    // Yoqilganda esa prod stek izi minifikatsiyalangan `Kbe is not a
    // function` o'rniga haqiqiy fayl/satrni ko'rsatadi. Telegram mini
    // ilovada bu yagona amaliy yo'l: WebView'da DevTools yo'q.
    sourcemap: process.env.SOURCEMAP === "true",
  },
});
