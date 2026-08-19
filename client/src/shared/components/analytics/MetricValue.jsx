import { cn } from "@/shared/utils/cn";
import { formatMoney, formatMoneyShort } from "@/shared/utils/formatMoney";
import isMissing from "./isMissing";

/**
 * MOLIYAVIY QIYMATNI KO'RSATISH — NULL XAVFSIZ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA ALOHIDA KOMPONENT
 *
 * Backend ATAYLAB `null` qaytaradi: marja hisoblanmagan bo'lsa,
 * taqqoslash mumkin bo'lmasa, o'lchov aniqlanmagan bo'lsa. Sabab
 * server tomonda yozilgan: `0%` "o'zgarish bo'lmadi" degan MA'NOGA
 * ega, holbuki haqiqat — "taqqoslab bo'lmaydi".
 *
 * Agar UI da `value || 0` yozilsa, o'sha ehtiyotkorlik BIR BELGIDA
 * yo'qoladi va ekranda ishonchli "0%" paydo bo'ladi. Shuning uchun
 * qiymat FAQAT shu komponent orqali chiqadi va u `null`/`undefined`/
 * `NaN`/`Infinity` ni "—" ga aylantiradi.
 * ═══════════════════════════════════════════════════════════════════
 */

export const Dash = ({ title = "Ma'lumot yo'q" }) => (
  <span className="text-muted-foreground" title={title}>
    —
  </span>
);

const MetricValue = ({
  value,
  kind = "number", // number | money | moneyShort | percent
  className,
  emptyTitle,
}) => {
  if (isMissing(value)) return <Dash title={emptyTitle} />;

  const n = Number(value);
  let text;
  if (kind === "money") text = formatMoney(n);
  else if (kind === "moneyShort") text = formatMoneyShort(n);
  else if (kind === "percent") text = `${n.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })}%`;
  else text = n.toLocaleString("uz-UZ");

  return <span className={cn("tabular-nums", className)}>{text}</span>;
};

export default MetricValue;
