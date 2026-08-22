import { Link } from "react-router-dom";
import { CalendarDays, BarChart3 } from "lucide-react";

import PageShell from "@/shared/components/page/PageShell";
import useActiveBranch from "@/shared/hooks/useActiveBranch";

import RoomsGrid from "../components/RoomsGrid";

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONALAR — ADMIN PANELIDA (talab 11, 32)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA ALOHIDA SAHIFA ──
 * Xonalar "Katalog > Kurslar va xonalar" jadvalining ikkinchi yarmida
 * yashiringandi. Administrator xona qo'shish uchun "Katalog" degan
 * so'zni topishi, ichkariga kirishi va ikkinchi jadvalgacha
 * aylantirishi kerak edi — talab 35 aynan shu holatni misol qilib
 * keltiradi ("odam xona qo'shishni qidirib yurmasin").
 *
 * ── FILIAL TANLAGICH YO'Q VA BO'LMAYDI ──
 * Ro'yxatni server administratorning ko'lami bo'yicha kesadi, yangi
 * xonani esa O'ZI uning filialiga bog'laydi
 * (`rooms.service.js: resolveBranchForWrite`). Ekranda filial faqat
 * YOZUV sifatida ko'rinadi — tanlov emas.
 *
 * Bu qulaylik emas, XAVFSIZLIK CHEGARASINING ko'rinishi: administrator
 * boshqa filialga xona qo'sha olmaydi va unga bunday imkoniyat bordek
 * ko'rsatish ham noto'g'ri bo'lardi.
 *
 * ── MODAL BU YERDA MOUNT QILINMAYDI ──
 * `MODAL.ROOM_CREATE` ni qobiq allaqachon ko'taradi
 * (`shared/components/create/CreateModals`, `AppSidebar` orqali).
 * Shu nomdagi ikkinchi `ModalWrapper` sahifada ham turgan bo'lsa,
 * BITTA `openModal` IKKITA dialog ochardi — ikkalasi ham ayni redux
 * kalitini kuzatadi.
 */
const RoomsPage = () => {
  const { activeBranch, isAllBranches, multiBranch, hasMultipleBranches } =
    useActiveBranch();

  // KO'LAM YOZUVI: "qaysi filialning xonalarini ko'ryapman?" degan
  // savol javobsiz qolmasligi kerak. Yakka markazda filial tushunchasi
  // umuman yo'q, shuning uchun yozuv ham yo'q.
  const scopeNote = !multiBranch
    ? "Markazning barcha xonalari"
    : isAllBranches && hasMultipleBranches
      ? "Barcha filiallar bo'yicha"
      : activeBranch?.name
        ? `${activeBranch.name} filiali`
        : "Sizga biriktirilgan filial";

  return (
    <PageShell
      title="Xonalar"
      subtitle={`${scopeNote} · guruh jadvali shu xonalarga bog'lanadi`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/owner/rooms/analytics"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition shadow-sm hover:bg-muted"
          >
            <BarChart3 className="size-4" />
            Tahlil
          </Link>
          <Link
            to="/owner/jadval"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition shadow-sm hover:bg-muted"
          >
            <CalendarDays className="size-4" />
            Haftalik jadval
          </Link>
        </div>
      }
    >
      <RoomsGrid />
    </PageShell>
  );
};

export default RoomsPage;
