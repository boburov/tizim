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

    /**
     * ══════════════════════════════════════════════════════════════════
     * BO'LAKLARGA AJRATISH (chunking)
     * ══════════════════════════════════════════════════════════════════
     *
     * ── MUAMMO ──
     * Butun ilova BITTA 2.3 MB lik faylda edi. O'quvchi login qilib
     * "qarzim bormi?" degan bitta savolga javob olish uchun ham
     * moliya tahlili, grafik kutubxonasi va rol tahrirlagichini
     * yuklab olardi. Telegram mini ilovada (mobil internet) bu
     * birinchi ekrangacha bo'lgan kutishni sezilarli uzaytiradi.
     *
     * ── NEGA MARSHRUT BO'YICHA `lazy()` EMAS (hozircha) ──
     * U kattaroq foyda berardi, lekin har `import` ni o'zgartirishni
     * va har sahifaga `Suspense` chegarasini talab qiladi — ya'ni
     * yuzlab faylga tegish. Vendor ajratish esa BITTA joyda va
     * xatarsiz: ilova kodiga umuman tegilmaydi.
     *
     * ── NEGA AYNAN SHU GURUHLAR ──
     * Ular ALMASHIB TURMAYDI: React va Recharts har relizda
     * o'zgarmaydi, ilova kodi esa o'zgaradi. Ajratilgach, foydalanuvchi
     * brauzeri ularni KESHDA saqlaydi va keyingi deploy'da faqat
     * ilova bo'lagini qayta yuklaydi.
     *
     * ── `recharts` BU YERDA ATAYLAB YO'Q ──
     * U dastlab shu ro'yxatda edi va NATIJA TESKARI bo'ldi: qo'lda
     * bo'lak e'lon qilinishi bilan u kirish faylining bog'liqligiga
     * aylandi va `index.html` ga `modulepreload` bo'lib tushdi —
     * ya'ni 360 kB grafik kutubxonasi HAR yuklanishda, hatto grafik
     * yo'q ekranda ham kelardi.
     *
     * Ro'yxatdan chiqarilgach, rollup uni O'ZI kerakli lazy bo'lakka
     * joylaydi. Qo'lda bo'lak — faqat HAR JOYDA kerak bo'ladigan
     * kutubxonalar uchun.
     */
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query", "axios"],
          "vendor-state": ["@reduxjs/toolkit", "react-redux"],
        },
      },
    },
    // Ogohlantirish chegarasi: eng katta bo'lak endi ~1 MB dan kichik.
    // Chegara "shovqin bo'lmasin" uchun ko'tarilmadi — u haqiqiy
    // to'siq bo'lib qolishi kerak.
    chunkSizeWarningLimit: 900,
  },
});
