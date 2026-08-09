import InputField from "@/shared/components/ui/input/InputField";
import { formatMoney } from "@/shared/utils/formatMoney";
import {
  OPENING_MAX_AMOUNT,
  parseOpeningAmount,
  isOpeningAmountValid,
} from "../utils/ledger";

/**
 * BOSHLANG'ICH QOLDIQ MAYDONI - odam yaratish formalarida.
 *
 * ─── BITTA INPUT, ISHORA BILAN ───
 *    0 (yoki bo'sh) - qarzdorlik yo'q, yozuv umuman yaratilmaydi
 *   -X             - bu odam markazga qarz
 *   +X             - markaz bu odamga qarzdor
 *
 * Qoida BARCHA rollar uchun bir xil, ya'ni "musbat nimani anglatadi?"
 * degan savol o'quvchida ham, o'qituvchida ham bitta javobga ega.
 *
 * ─── NEGA JONLI IZOH MAJBURIY ───
 * Ishoraning o'zi noaniq: "-3 000 000" ni ko'rgan odam uni "biz 3 mln
 * qarzmiz" deb ham o'qiy oladi. Shuning uchun input ostida kiritilgan
 * summa DARHOL so'z bilan takrorlanadi - odam saqlashdan oldin
 * yo'nalishni ko'zi bilan tasdiqlaydi.
 *
 * Forma holati chaqiruvchida turadi (useObjectState) - komponent
 * `openingBalance` va `openingNote` maydonlarini o'qiydi/yozadi.
 */
const OpeningBalanceField = ({ form, disabled = false, personLabel = "odam" }) => {
  const raw = form.openingBalance;
  const amount = parseOpeningAmount(raw);
  const tooBig = !isOpeningAmountValid(raw);
  // Izoh maydoni faqat summa kiritilganda kerak - nol qoldiqda yozuv
  // umuman yaratilmaydi va izohning boradigan joyi yo'q.
  const hasAmount = amount !== 0;

  const preview = () => {
    if (tooBig) return null;
    if (!hasAmount) {
      return {
        tone: "text-muted-foreground",
        text: "Qarzdorlik yo'q - boshlang'ich qoldiq yozilmaydi.",
      };
    }
    return amount > 0
      ? {
          tone: "text-emerald-700 dark:text-emerald-300",
          text: `Markaz bu ${personLabel}ga ${formatMoney(amount)} qarzdor bo'lib boshlaydi.`,
        }
      : {
          tone: "text-red-600 dark:text-red-300",
          text: `Bu ${personLabel} markazga ${formatMoney(Math.abs(amount))} qarzdor bo'lib boshlaydi.`,
        };
  };

  const hint = preview();

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div>
        <p className="text-sm font-medium">Boshlang'ich qoldiq</p>
        <p className="text-xs text-muted-foreground">
          Tizimga kiritilishidan OLDINGI hisob-kitob. Keyingi barcha to'lov va
          maosh shu nuqtadan boshlanadi.
        </p>
      </div>

      <InputField
        type="money"
        name="openingBalance"
        label="Summa"
        placeholder="0"
        value={raw}
        onChange={(e) => form.setField("openingBalance", e.target.value)}
        error={tooBig}
        disabled={disabled}
        // IMask Number niqobi manfiy qiymatni min < 0 bo'lganda qabul
        // qiladi. Chegara server bilan bir xil - nol xatosidan himoya
        // (300 000 o'rniga 300 000 000 yozib yuborish) shu yerda ham
        // ushlanadi, serverga borib qaytishni kutmasdan.
        min={-OPENING_MAX_AMOUNT}
        max={OPENING_MAX_AMOUNT}
        description="Manfiy (-) = bu odam qarzdor · Musbat (+) = markaz qarzdor · 0 = qarzdorlik yo'q"
      />

      {tooBig && (
        <p className="text-xs text-red-600 dark:text-red-300">
          Summa {formatMoney(OPENING_MAX_AMOUNT)}dan oshmasligi kerak.
        </p>
      )}

      {hint && (
        <div className={`rounded-md bg-muted/40 px-3 py-2 text-sm ${hint.tone}`}>
          {hint.text}
        </div>
      )}

      {hasAmount && !tooBig && (
        <>
          <InputField
            name="openingNote"
            label="Izoh (ixtiyoriy)"
            placeholder="Masalan: 2025-yil dekabr oyi hisob-kitobi"
            value={form.openingNote}
            onChange={(e) => form.setField("openingNote", e.target.value)}
            disabled={disabled}
          />
          {/* Yozuv O'ZGARMAS: bir marta kiritilgach uni tahrirlash ham,
              o'chirish ham mumkin emas (server tomonda immutable +
              unique indeks). Xatoni faqat korreksiya tranzaksiyasi
              bilan tuzatib bo'ladi - odam buni YOZISHDAN OLDIN
              bilishi kerak. */}
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Diqqat: boshlang'ich qoldiq bir marta kiritiladi va keyin
            o'zgartirib bo'lmaydi.
          </p>
        </>
      )}
    </div>
  );
};

export default OpeningBalanceField;
