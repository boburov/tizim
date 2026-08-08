import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import useTeacherSalaryBalanceQuery from "../hooks/useTeacherSalaryBalanceQuery";

/**
 * O'QITUVCHINING JORIY MAOSH HOLATI.
 *
 * Bitta qarashda javob beradigan savollar:
 *   1. "Qancha oladi?"            - fiksa stavka + bu oygi jami daromad
 *   2. "Qachondan beri ishlaydi?" - ishga kirgan sana + ishlagan kunlar
 *   3. "Qancha qarzmiz?"          - o'tgan oylar qoldig'i + bu oy shu
 *                                   kungacha ishlab olgani = jami qoldiq
 *
 * NEGA "BU OY (SHU KUNGACHA)" ALOHIDA TURADI: joriy oy maoshi oy BOSHIDA
 * to'liq summa bilan yaratiladi, ya'ni oyning 8-kunida ham "31 kunlik
 * oylik" kutilayotgan bo'lib turadi. O'qituvchi bilan oy o'rtasida
 * hisob-kitob qilinganda kerak bo'ladigan raqam esa BOSHQA - shu kungacha
 * haqiqatda ishlab olingani. Ikkisini bitta ustunga qo'shib bo'lmaydi.
 */
const TeacherSalaryBalanceCard = ({ teacherId }) => {
  const { data, isLoading, isError } = useTeacherSalaryBalanceQuery(teacherId);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
        Maosh holati yuklanmoqda...
      </div>
    );
  }

  // Xato bo'lsa kartochka umuman chiqmaydi: bu yordamchi ko'rinish va
  // uning o'rniga qizil xato blokini qo'yish profilni buzardi (stavka
  // kartochkasi baribir pastda turadi).
  if (isError || !data) return null;

  const {
    fixedMonthly = 0,
    monthlyTotal = 0,
    hiredAt,
    daysWorked,
    previousRemaining = 0,
    currentAccrued = 0,
    currentPaid = 0,
    totalRemaining = 0,
  } = data;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* ── STAVKA VA DAROMAD ── */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        <Tile
          label="Fiks maosh"
          value={fixedMonthly > 0 ? formatMoney(fixedMonthly) : "—"}
          hint={fixedMonthly > 0 ? "" : "Fiksa stavka belgilanmagan"}
          className="bg-muted/60 sm:w-1/3"
        />
        <Tile
          label="Jami daromad"
          value={formatMoney(monthlyTotal)}
          hint="Bu oy uchun kutilayotgan to'liq summa"
          className="bg-emerald-50 dark:bg-emerald-500/10 sm:w-1/3"
        />
      </div>

      {/* ── QOLDIQLAR ──
          To'rt ustun: chapdan o'ngga o'qilganda hisob-kitob zanjiri
          ko'rinadi (qachondan beri → oldingi qarz → bu oy → jami). */}
      <div className="grid grid-cols-1 divide-y divide-border border-t md:grid-cols-4 md:divide-x md:divide-y-0">
        <Cell label="Ishga kirgan">
          <p className="font-semibold tabular-nums">
            {hiredAt ? formatDateUz(hiredAt) : "—"}
          </p>
          {daysWorked != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {daysWorked} kun ishladi
            </p>
          )}
        </Cell>

        <Cell label="Oy boshigacha qoldiq">
          <Amount value={previousRemaining} />
        </Cell>

        <Cell label="Bu oy (shu kungacha)">
          <Amount value={currentAccrued} />
          {currentPaid > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              to&apos;langan: {formatMoney(currentPaid)}
            </p>
          )}
        </Cell>

        <Cell
          label="Jami qoldiq"
          className="bg-emerald-50 dark:bg-emerald-500/10"
        >
          <p
            className={`font-semibold tabular-nums ${
              totalRemaining < 0
                ? "text-amber-600 dark:text-amber-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {formatMoney(totalRemaining)}
          </p>
          {totalRemaining < 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              ortiqcha to&apos;langan
            </p>
          )}
        </Cell>
      </div>
    </div>
  );
};

const Tile = ({ label, value, hint, className = "" }) => (
  <div className={`rounded-md px-4 py-3 ${className}`}>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const Cell = ({ label, className = "", children }) => (
  <div className={`px-4 py-3 ${className}`}>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <div className="mt-1">{children}</div>
  </div>
);

// Manfiy qoldiq = markaz ortiqcha to'lagan. Uni ham KO'RSATAMIZ (nolga
// qisib yashirmaymiz): aks holda ortiqcha to'lov jimgina yo'qolib,
// keyingi oyda "nega kam to'landi?" degan savol chiqardi.
const Amount = ({ value }) => (
  <p
    className={`font-semibold tabular-nums ${
      value < 0 ? "text-amber-600 dark:text-amber-300" : ""
    }`}
  >
    {formatMoney(value)}
  </p>
);

export default TeacherSalaryBalanceCard;
