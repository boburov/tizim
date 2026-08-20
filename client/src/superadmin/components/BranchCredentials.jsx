import { useState } from "react";
import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";

import Button from "@/shared/components/ui/button/Button";
import { QueryState } from "@/shared/components/analytics";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import useBranchStatsQuery from "@/owner/features/branches/hooks/useBranchStatsQuery";
import useUserPasswordQuery from "@/owner/features/users/hooks/useUserPasswordQuery";

/**
 * ══════════════════════════════════════════════════════════════════════
 * FILIAL KIRISH MA'LUMOTLARI — LOGIN VA PAROL
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA BU KERAK ──
 * Super Admin filialni OCHADI (nom + login + parol) va keyin o'sha
 * ma'lumotni direktorga aytishi kerak. Ilgari u yaratish oynasi
 * yopilishi bilan YO'QOLARDI: panelda hech qayerda "bu filialga kim,
 * qaysi login bilan kiradi" degan savolning javobi yo'q edi.
 *
 * ── PAROL HAQIQATAN KO'RSATILADI ──
 * Bu loyihada parollar ATAYLAB ochiq matnda saqlanadi
 * (`server/src/helpers/password.helper.js`: `hashPassword` — bu
 * shunchaki `String(plain)`). Ya'ni bu ekran parolni "tiklamaydi" va
 * "yangilamaydi" — u mavjud qiymatni ko'rsatadi.
 *
 * ── QANDAY QO'RIQLANADI ──
 * Parol ALOHIDA so'rov bilan va faqat "Ko'rsatish" bosilganda keladi
 * (`enabled`), keshda saqlanmaydi (`gcTime: 0`). Server tomonda esa
 * `users.password` ruxsati VA filial ko'lami tekshiriladi — u yerda
 * `branches.view_all` ataylab o'tkazgich EMAS
 * (`helpers/credentialScope.helper.js`), ya'ni bu komponentni boshqa
 * joyga qo'yib qo'yish bilan ham begona filial paroli ochilmaydi.
 *
 * ── NEGA RO'YXAT, BITTA "DIREKTOR" EMAS ──
 * Filialga bir nechta boshqaruvchi biriktirilishi mumkin (direktor,
 * administrator, buxgalter) va ularning har biri o'z logini bilan
 * kiradi. "Direktor" degan yagona maydon yo'q — server filialdagi
 * boshqaruv rollarini qaytaradi (`/branches/:id/stats` → `managers`).
 */

const CredentialRow = ({ manager, canSeePassword }) => {
  const [visible, setVisible] = useState(false);
  // So'rov FAQAT ochilganda ketadi — ro'yxat chizilishi bilan hamma
  // parolni tortib olish keraksiz va xavfli bo'lardi.
  const { data, isLoading } = useUserPasswordQuery(manager.id, visible);

  const password = data?.password || "";
  const fullName =
    `${manager.firstName || ""} ${manager.lastName || ""}`.trim() || manager.username;

  const copy = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} nusxa olindi`);
    } catch {
      toast.error("Nusxa olishda xatolik");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{manager.role}</p>
      </div>

      {/* ── LOGIN ── */}
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">Login</p>
        <button
          type="button"
          onClick={() => copy(manager.username, "Login")}
          className="inline-flex items-center gap-1 font-mono text-sm text-foreground hover:underline"
          title="Nusxa olish"
        >
          {manager.username}
          <Copy className="size-3 text-muted-foreground" />
        </button>
      </div>

      {/* ── PAROL ── */}
      {canSeePassword && (
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">Parol</p>
        {visible ? (
          <button
            type="button"
            onClick={() => copy(password, "Parol")}
            className="inline-flex items-center gap-1 font-mono text-sm text-foreground hover:underline"
            title="Nusxa olish"
          >
            {isLoading ? "..." : password || "—"}
            <Copy className="size-3 text-muted-foreground" />
          </button>
        ) : (
          <span className="font-mono text-sm text-muted-foreground">••••••</span>
        )}
      </div>
      )}

      {canSeePassword && (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Parolni yashirish" : "Parolni ko'rsatish"}
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        {visible ? "Yashirish" : "Ko'rsatish"}
      </Button>
      )}
    </div>
  );
};

const BranchCredentials = ({ branchId, enabled = true }) => {
  const { has } = usePermissions();
  // LOGIN va PAROL — IKKI XIL SEZGIRLIK.
  //
  // Login "kim kiradi" degan savolning javobi va u xodimlar
  // ro'yxatida ham ko'rinadi (`users.read`). Parol esa hisobga
  // KIRISH imkoni — u alohida ruxsat talab qiladi (`users.password`)
  // va server buni qayta tekshiradi.
  const canSeeLogin = has(PERMISSIONS.USERS_READ);
  const canSeePassword = has(PERMISSIONS.USERS_PASSWORD);

  const stats = useBranchStatsQuery(branchId, { enabled: enabled && canSeeLogin });

  // ── JIMGINA YO'QOLMAYDI ──
  //
  // Ilgari bu yerda `if (!canSee) return null` turardi va bo'lim
  // butunlay g'oyib bo'lardi: foydalanuvchi "nega ko'rinmayapti?"
  // degan savolga javob topa olmasdi va bu xatolikka o'xshab
  // ko'rinardi. Endi bo'lim QOLADI va sababni aytadi.
  if (!canSeeLogin) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <KeyRound className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Kirish ma&apos;lumotlari</h2>
        </div>
        <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground">
          Bu ma&apos;lumotni ko&apos;rish uchun foydalanuvchilarni ko&apos;rish ruxsati kerak.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Kirish ma'lumotlari</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Bu filialga biriktirilgan boshqaruvchilar qaysi login bilan kiradi.
        Parol so&apos;ralganda alohida olinadi va keshda saqlanmaydi.
      </p>

      <QueryState
        query={stats}
        empty={!stats.data?.managers?.length}
        emptyTitle="Bu filialga hali direktor biriktirilmagan"
        emptyHint="Shu sababli bu yerda login ham yo'q — filialga kiradigan odam mavjud emas. Direktorni «Xodimlar» dan yaratib, unga shu filialni biriktiring; yoki filial ochishda login va parolni birga kiriting."
        loadingRows={2}
      >
        {(data) => (
          <div className="space-y-2">
            {data.managers.map((m) => (
              <CredentialRow
                key={m.id || m._id}
                manager={{ ...m, id: m.id || m._id }}
                canSeePassword={canSeePassword}
              />
            ))}
          </div>
        )}
      </QueryState>
    </section>
  );
};

export default BranchCredentials;
