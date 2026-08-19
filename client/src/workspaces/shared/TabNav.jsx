import { useSearchParams } from "react-router-dom";

import { cn } from "@/shared/utils/cn";
import { visibleTabs } from "./tabState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * BO'LIM TABLARI — holat URL DA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA `useState` EMAS ──
 * Tab — sahifaning bir qismi emas, KO'RINISHI. Foydalanuvchi
 * "filiallar P&L" ni hamkasbiga yuborganda havola aynan o'sha
 * ko'rinishni ochishi kerak. `useState` bilan u har doim birinchi
 * tabga tushardi.
 *
 * `replace: true` — tab almashtirish brauzer tarixini to'ldirmasin:
 * "orqaga" tugmasi oldingi SAHIFAGA qaytishi kerak, o'n marta bosilgan
 * tabdan o'tib emas.
 *
 * ── RUXSAT ──
 * Ruxsati yo'q tab KO'RSATILMAYDI, lekin bu qulaylik — xavfsizlik
 * emas. URL'ga qo'lda yozib kirgan odam bo'sh yoki "ruxsat yo'q"
 * blokini ko'radi, server esa baribir 403 qaytaradi.
 *
 * ── NOMA'LUM `?tab=` QIYMATI ──
 * Birinchi ko'rinadigan tabga tushadi. Aks holda ekran bo'm-bo'sh
 * bo'lardi va foydalanuvchi buni "sahifa buzuq" deb o'qirdi —
 * eskirgan xatcho'q uchun juda qattiq jazo.
 */
const TabNav = ({ tabs, param = "tab", className }) => {
  const [params, setParams] = useSearchParams();
  const visible = visibleTabs(tabs);
  const raw = params.get(param);
  const active = visible.some((t) => t.key === raw) ? raw : visible[0]?.key;

  const select = (key) => {
    const next = new URLSearchParams(params);
    next.set(param, key);
    setParams(next, { replace: true });
  };

  if (!visible.length) return null;

  return (
    <nav
      aria-label="Bo'limlar"
      className={cn(
        "flex flex-wrap gap-1 overflow-x-auto rounded-lg bg-muted p-1",
        className,
      )}
    >
      {visible.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => select(t.key)}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5",
            "text-sm font-medium transition",
            active === t.key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.icon && <t.icon className="size-3.5" />}
          {t.label}
        </button>
      ))}
    </nav>
  );
};

export default TabNav;
