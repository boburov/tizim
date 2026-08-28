import { Printer } from "lucide-react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/shared/components/shadcn/dialog";
import Button from "@/shared/components/ui/button/Button";
import { APP_NAME } from "@/shared/constants/app";
import { paymentMethodLabel } from "@/shared/constants/finance";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateTimeUz } from "@/shared/utils/formatDate";

/**
 * ══════════════════════════════════════════════════════════════════════
 * KVITANSIYA (chek) — JURNAL YOZUVIDAN, HISOBLAB EMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── ENG MUHIM QOIDA: SUMMA O'YLAB TOPILMAYDI ──
 * Bu komponent `d` obyektini TAYYOR holda oladi — u
 * `GET /finance-analytics/entries/:id` javobi, ya'ni jurnal yozuvining
 * o'zi. Bu yerda hech narsa qo'shilmaydi, ayirilmaydi va
 * formatlashdan boshqa hech qanday amal bajarilmaydi.
 *
 * Sabab oddiy: chek — hujjat. Unda ekranda ko'ringan raqamdan
 * BOSHQA son chiqsa, ikkalasi ham ishonchini yo'qotadi. Shuning
 * uchun forma qiymati, kesh yoki "qulaylik uchun" hisoblangan netto
 * bu yerga umuman kirmaydi.
 *
 * ── NEGA HAR JOYDA BITTA KOMPONENT ──
 * Chek o'quvchi to'lovi, chiqim, maosh va qaytarim uchun ham kerak.
 * Ular BOSHQA hujjatlar, lekin HAMMASI bitta jurnal yozuviga
 * aylanadi — demak chek ham bitta. To'lov uchun alohida, chiqim
 * uchun alohida shablon yozilsa, ular asta-sekin boshqacha
 * ko'rinishga ega bo'lardi va bitta markazdan ikki xil hujjat
 * chiqardi.
 *
 * ── FAQAT MAVJUD QATORLAR ──
 * Server yo'q o'lchovni umuman qaytarmaydi (`dimensions`), shuning
 * uchun ijara chekida "O'quvchi: —" degan bo'sh satr chiqmaydi.
 */

/** Bo'sh qiymatli qator UMUMAN chizilmaydi — chekda joy qimmat. */
const Line = ({ label, value }) =>
  value ? (
    <div className="flex justify-between gap-4 py-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  ) : null;

/**
 * TO'LOVCHI / OLUVCHI — yozuv TURIGA qarab.
 *
 * Jurnalda uchala odam ham `User`, lekin ROLI boshqa. Chekda
 * "kimdan/kimga" savoli aniq javob talab qiladi: o'quvchi to'lovida
 * pul KELADI, maoshda esa KETADI.
 */
const counterparty = (d) => {
  const dim = d.dimensions || {};
  if (dim.student) return { label: "To'lovchi", value: dim.student.name };
  if (dim.teacher) return { label: "Oluvchi", value: dim.teacher.name };
  if (dim.staff) return { label: "Oluvchi", value: dim.staff.name };
  return null;
};

export const ReceiptBody = ({ entry: d, orgName = APP_NAME }) => {
  const party = counterparty(d);

  return (
    <div className="print-receipt rounded-xl border border-border bg-card p-5 text-foreground">
      <header className="border-b border-border pb-3">
        <p className="text-base font-semibold">{orgName}</p>
        {d.branch?.name && (
          <p className="text-xs text-muted-foreground">{d.branch.name}</p>
        )}
      </header>

      <div className="border-b border-border py-4 text-center">
        <p className="text-xs text-muted-foreground">{d.kindLabel}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatMoney(d.amount)}
        </p>
      </div>

      <div className="divide-y divide-border/60 py-2">
        <div className="py-1">
          <Line label="Sana" value={d.date ? formatDateTimeUz(d.date) : null} />
          <Line label="Hujjat raqami" value={d.id} />
        </div>

        <div className="py-1">
          {party && <Line label={party.label} value={party.value} />}
          <Line
            label="To'lov usuli"
            value={
              d.dimensions?.paymentMethod
                ? paymentMethodLabel(d.dimensions.paymentMethod)
                : null
            }
          />
          <Line label="Guruh" value={d.dimensions?.group?.name} />
          <Line label="Yo'nalish" value={d.dimensions?.course?.name} />
          <Line label="Kategoriya" value={d.dimensions?.expenseCategory?.name} />
          <Line
            label="Davr"
            value={
              d.dimensions?.period
                ? `${d.dimensions.period.year}-${String(d.dimensions.period.month).padStart(2, "0")}`
                : null
            }
          />
        </div>

        <div className="py-1">
          <Line label="Izoh" value={d.memo} />
          <Line label="Rasmiylashtirdi" value={d.audit?.createdBy?.name} />
        </div>
      </div>

      <footer className="border-t border-border pt-3 text-[11px] text-muted-foreground">
        {/* Yozuv o'chirilmaydi va tahrirlanmaydi (storno bilan
            tuzatiladi) — shuning uchun chekdagi ID doim o'sha
            hujjatga olib boradi. */}
        Hujjat asosi: qo'sh yozuv jurnali · {d.postingKey || d.id}
      </footer>
    </div>
  );
};

/**
 * Chek oynasi.
 *
 * `window.print()` — brauzerning o'z oynasi. PDF kutubxonasi ATAYLAB
 * qo'shilmadi: har brauzerda "PDF ga saqlash" allaqachon bor, qo'shimcha
 * kutubxona esa shrift, sahifa chegarasi va o'zbekcha harflar bo'yicha
 * o'z muammolarini olib kelardi.
 */
const TransactionReceipt = ({ entry, open, onOpenChange }) => {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="print-hide">
          <DialogTitle>Kvitansiya</DialogTitle>
          <DialogDescription>
            Ma'lumot jurnal yozuvidan olinadi — o'zgartirib bo'lmaydi.
          </DialogDescription>
        </DialogHeader>

        <ReceiptBody entry={entry} />

        <div className="print-hide flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 size-4" />
            Chop etish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionReceipt;
