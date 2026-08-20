import PageShell from "@/shared/components/page/PageShell";
import { SystemAnalysisTabs } from "@/owner/features/systemAnalysis";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TIZIM TAHLILI — TASHKILOT KO'LAMIDA
 * ══════════════════════════════════════════════════════════════════════
 *
 * Kesimlar Admin panelidagi bilan AYNI (`SystemAnalysisTabs`):
 * Tavsiyalar · Foydalilik · Yo'nalishlar · Xonalar · O'quv jarayoni ·
 * Jamoa.
 *
 * ── FARQ FAQAT KO'LAMDA ──
 * Bu yerda filial tanlanmagan, ya'ni server so'rovlarni butun
 * tashkilot bo'yicha qaytaradi. Administrator o'sha ekranni ochganda
 * server uni filial bilan kesadi. Ekran BITTA — "tashkilot versiyasi"
 * va "filial versiyasi" degan ikki nusxa yo'q va bo'lmasligi kerak:
 * ular muqarrar ajralib ketardi va bir xil savolga ikki xil javob
 * berardi.
 */
const TizimTahliliPage = () => (
  <PageShell
    title="Tizim tahlili"
    subtitle="Butun tashkilot bo'yicha — nimaga e'tibor berish kerak"
  >
    <SystemAnalysisTabs />
  </PageShell>
);

export default TizimTahliliPage;
