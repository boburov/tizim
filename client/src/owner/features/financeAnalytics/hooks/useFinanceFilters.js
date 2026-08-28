import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * MOLIYA FILTRLARI — URL ICHIDA saqlanadi.
 *
 * ── NEGA URL, komponent holati EMAS ──
 * Moliyaviy ko'rinish deyarli har doim BIROV BILAN BO'LISHILADI:
 * "avgust, 2-filial, marketing bo'yicha shu raqamga qara". Filtr
 * komponent holatida yashasa, havola boshqa odamda BUTUNLAY BOSHQA
 * raqamni ochardi — va ikkalasi bir xil ekranga qarab turib boshqa
 * son ko'rgan bo'lardi.
 *
 * URL'da bo'lgani uchun: sahifa yangilansa filtr saqlanadi, orqaga
 * tugmasi ishlaydi, havola bo'lishish xavfsiz.
 *
 * ── BO'SH QIYMAT URL'DA SAQLANMAYDI ──
 * `?branchId=&teacherId=` kabi bo'sh parametrlar havolani iflos
 * qiladi va serverga ham keraksiz uzatiladi. `set` ularni olib
 * tashlaydi.
 */

// Serverdagi `analyticsFilterSchema` bilan bir xil maydonlar.
const KEYS = [
  "from", "to", "year", "month",
  "branchId", "teacherId", "courseId", "groupId", "roomId", "studentId",
  "expenseCategoryId", "paymentMethod", "costType", "accountKind",
  "granularity",
  // Ro'yxat uzunligi. Serverdagi `analyticsFilterSchema` ham `limit`
  // ni biladi (1..200), shuning uchun u to'g'ridan-to'g'ri uzatiladi.
  "limit",
];

const now = new Date();

/** Standart davr — joriy oy (server ham shu standartga ega). */
export const defaultPeriod = () => ({
  year: String(now.getFullYear()),
  month: String(now.getMonth() + 1),
});

const useFinanceFilters = () => {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const out = {};
    for (const k of KEYS) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
    // Davr ko'rsatilmagan bo'lsa joriy oy — server bilan bir xil qoida.
    if (!out.from && !out.to && !out.year) Object.assign(out, defaultPeriod());
    return out;
  }, [params]);

  const set = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      // Davr turi almashganda ikkinchisi QOLIB KETMASLIGI kerak:
      // `from/to` va `year/month` birga kelsa server `from/to` ni
      // ustun qo'yadi va foydalanuvchi tanlagan oy jimgina e'tiborsiz
      // qolardi.
      if (patch.from || patch.to) { next.delete("year"); next.delete("month"); }
      if (patch.year || patch.month) { next.delete("from"); next.delete("to"); }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const reset = useCallback(() => {
    const next = new URLSearchParams();
    const d = defaultPeriod();
    next.set("year", d.year);
    next.set("month", d.month);
    setParams(next, { replace: true });
  }, [setParams]);

  /** Faol (standart bo'lmagan) filtrlar soni — UI belgisi uchun. */
  const activeCount = useMemo(
    () =>
      KEYS.filter(
        (k) =>
          // Davr, guruhlash va ro'yxat uzunligi — KO'RINISH sozlamasi,
          // filtr emas. Ular "3 filtr faol" belgisiga kirsa, belgi
          // hech qachon nolga tushmasdi va ma'nosini yo'qotardi.
          !["year", "month", "granularity", "limit"].includes(k) && params.get(k),
      ).length,
    [params],
  );

  return { filters, set, reset, activeCount };
};

export default useFinanceFilters;
