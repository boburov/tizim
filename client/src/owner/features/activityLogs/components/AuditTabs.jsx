import { cn } from "@/shared/utils/cn";

/**
 * ══════════════════════════════════════════════════════════════════════
 * AUDIT SAHIFASINING UCH TAB'I
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA TAB, BITTA BIRLASHTIRILGAN JADVAL EMAS ──
 * "Administrator bugun nima qildi" degan savolga bitta jadval to'liq
 * javob bera olmaydi: uch manba uch xil narsani saqlaydi.
 *
 *   Faoliyat  `ActivityLog`        HTTP izi: metod, yo'l, status
 *   Moliya    `FinancialAuditLog`  qiymat o'zgarishi: eski → yangi, summa
 *   Oylik     `PayrollAuditLog`    xodim + davr (yil/oy) + sabab
 *
 * Ularni bitta jadvalga (union) siqish uchun har biridan eng qimmatli
 * ustunlarni tashlab yuborish kerak bo'lardi — "500 000 so'm 300 000 ga
 * o'zgardi" o'rniga "PATCH /payments/x → 200" qolardi.
 *
 * ── FILTRLAR TAB'DAN TASHQARIDA ──
 * "Xodim" va "sana" uchala manbaga ham tegishli, shuning uchun ular
 * tab'lar USTIDA turadi va tab almashganda SAQLANADI: odam bir odamni
 * tanlab, uchala izni ketma-ket ko'rib chiqadi. Tabga xos filtrlar
 * (modul, amal turi) esa faqat o'z tab'ida chiziladi.
 */
const AuditTabs = ({ value, onChange, tabs }) => (
  <nav
    aria-label="Bo'limlar"
    className="flex gap-1 overflow-x-auto border-b border-border"
  >
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        onClick={() => onChange(tab.key)}
        aria-current={value === tab.key ? "page" : undefined}
        className={cn(
          "-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition",
          value === tab.key
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        {tab.label}
      </button>
    ))}
  </nav>
);

export default AuditTabs;
