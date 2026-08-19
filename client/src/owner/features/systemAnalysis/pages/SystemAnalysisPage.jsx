import { Activity, DoorOpen } from "lucide-react";

import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";
import usePermissions from "@/shared/hooks/usePermissions";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { OperationsCenterPage } from "@/owner/features/ai";
import { RoomUtilizationSection } from "@/owner/features/rooms";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TIZIM TAHLILI — ADMIN PANELIDA (talab 28, 31)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── DVIGATEL QAYTA QURILMADI ──
 * Talab buni ochiq taqiqlaydi va bu to'g'ri: `modules/ai` da sakkizta
 * signal, brifing, reyting va bashorat allaqachon bor va ular
 * ishlaydi. Bu yerda YANGI tahlil yo'q — bor tahlilning JOYI va
 * KONTEKSTI o'zgardi.
 *
 * O'zgargani:
 *   • u endi `/owner/ai` degan texnik manzilda emas, "Tizim tahlili"
 *     nomi bilan menyuda turadi — administrator uni QIDIRMAYDI;
 *   • yoniga XONA tahlili qo'shildi: "qaysi xona bo'sh, qaysi biri
 *     to'lib ketgan, qaysi guruhga xona biriktirilmagan" (talab 31
 *     aynan shu misollarni keltiradi).
 *
 * ── KO'LAM ──
 * Ayni komponentlar Super Admin panelida ham turadi. Farq MA'LUMOTDA:
 * server har so'rovni filial ko'lami bilan kesadi, ya'ni administrator
 * O'Z filialining tahlilini ko'radi. Bitta tahlil, ikki ko'lam.
 */
const SystemAnalysisPage = () => {
  const { has } = usePermissions();
  const { activeBranch, isAllBranches, multiBranch, hasMultipleBranches } =
    useActiveBranch();

  const canAi = has(PERMISSIONS.AI_READ);
  const canRooms = has(PERMISSIONS.CLASSES_READ);

  const TABS = [
    { key: "umumiy", label: "Umumiy", icon: Activity, visible: canAi },
    { key: "xonalar", label: "Xonalar", icon: DoorOpen, visible: canRooms },
  ];
  const tab = useActiveTab(TABS);

  // KO'LAM YOZUVI — tahlil qaysi ma'lumot ustida ishlayotgani
  // ko'rinib tursin. "Bandlik 40%" degan raqam qaysi filialniki
  // ekani noaniq bo'lsa, u foydasiz.
  const scope = !multiBranch
    ? "Markaz bo'yicha"
    : isAllBranches && hasMultipleBranches
      ? "Barcha filiallar bo'yicha"
      : activeBranch?.name
        ? `${activeBranch.name} filiali bo'yicha`
        : "Sizga biriktirilgan filial bo'yicha";

  if (!TABS.some((t) => t.visible)) {
    return (
      <PageShell title="Tizim tahlili">
        <EmptyState
          icon={Activity}
          title="Tahlil yopiq"
          hint="Bu bo'limni ochish uchun tizim tahlili yoki xonalarni ko'rish ruxsati kerak."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Tizim tahlili"
      subtitle={`${scope} · nimaga e'tibor berish kerak`}
    >
      <TabNav tabs={TABS} />

      {tab === "umumiy" && canAi && <OperationsCenterPage embedded />}
      {tab === "xonalar" && canRooms && (
        <RoomUtilizationSection enabled={tab === "xonalar"} />
      )}
    </PageShell>
  );
};

export default SystemAnalysisPage;
