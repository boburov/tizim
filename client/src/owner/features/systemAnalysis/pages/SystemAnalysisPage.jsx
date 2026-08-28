import PageShell from "@/shared/components/page/PageShell";
import useActiveBranch from "@/shared/hooks/useActiveBranch";

import SystemAnalysisTabs from "../components/SystemAnalysisTabs";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TIZIM TAHLILI — ADMIN PANELIDA (talab 28, 31)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── DVIGATEL QAYTA QURILMADI ──
 * Talab buni ochiq taqiqlaydi va bu to'g'ri: `modules/ai` da sakkizta
 * signal, brifing, reyting va bashorat allaqachon bor. Bu yerda YANGI
 * tahlil yo'q — bor tahlilning JOYI va KO'LAMI.
 *
 * ── SUPER ADMIN BILAN AYNI KESIMLAR ──
 * Ilgari bu sahifada faqat ikkita tab bor edi (AI markazi + xonalar),
 * Super Adminda esa oltita. Ya'ni administrator o'z filiali haqidagi
 * foydalilik, yo'nalish va jamoa kesimlarini KO'RA OLMASDI — holbuki
 * talab 31 unga AYNI tahlilni, faqat filial ko'lamida beradi.
 *
 * Endi kesimlar bitta komponentda (`SystemAnalysisTabs`) va ikkala
 * panel ham o'shani chizadi. Ko'lamni server qo'llaydi.
 */
const SystemAnalysisPage = () => {
  const { activeBranch, isAllBranches, multiBranch, hasMultipleBranches } =
    useActiveBranch();

  // KO'LAM YOZUVI — tahlil qaysi ma'lumot ustida ishlayotgani ko'rinib
  // tursin. "Bandlik 40%" degan raqam qaysi filialniki ekani noaniq
  // bo'lsa, u foydasiz.
  const scope = !multiBranch
    ? "Markaz bo'yicha"
    : isAllBranches && hasMultipleBranches
      ? "Barcha filiallar bo'yicha"
      : activeBranch?.name
        ? `${activeBranch.name} filiali bo'yicha`
        : "Sizga biriktirilgan filial bo'yicha";

  return (
    <PageShell
      title="Tizim tahlili"
      subtitle={scope}
    >
      <SystemAnalysisTabs />
    </PageShell>
  );
};

export default SystemAnalysisPage;
