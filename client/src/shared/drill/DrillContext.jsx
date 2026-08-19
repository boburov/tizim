import { useCallback, useMemo, useState } from "react";

import { DrillContext } from "./drillStore";

/**
 * ══════════════════════════════════════════════════════════════════════
 * DRILL-DOWN KONTEKSTI — ilova bo'ylab YAGONA panel (talab 12)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA PANEL, YANGI SAHIFA EMAS ──
 * Foydalanuvchi tanlagan DAVR, FILIAL va filtrlar — bu kontekst.
 * Yangi sahifaga o'tilsa u yo'qoladi va "qayerda edim?" degan savol
 * tug'iladi. Panel esa ustiga ochiladi: orqa fonda o'sha jadval
 * turadi va yopilganda odam AYNAN o'sha qatorga qaytadi.
 *
 * ── NEGA STACK (ustma-ust) ──
 * Zanjir uzun: daromad → guruh → o'quvchi → to'lov → yozuv. Har
 * qadamda panelni almashtirish "orqaga" tugmasini yo'q qilardi.
 * Stack esa yo'lni saqlaydi: yuqoridagi nom qatori (breadcrumb)
 * butun yo'lni ko'rsatadi va istalgan bo'g'inga qaytish mumkin.
 *
 * ── FILTRLAR MEROS BO'LADI ──
 * Stackdagi har tugun o'z filtrini qo'shadi. Ya'ni "IELTS yo'nalishi
 * → A guruhi" ochilganda so'rov `courseId` VA `groupId` bilan ketadi.
 * Shu sababli ichkaridagi jami tashqaridagi raqamdan OSHIB ketmaydi.
 *
 * ── XAVFSIZLIK ──
 * Panel hech qanday ma'lumotni o'zi olib kelmaydi — u faqat mavjud
 * endpoint'larni chaqiradi. Ruxsati yo'q bo'lim 403 qaytaradi va
 * `QueryState` uni "ruxsat yo'q" bloki qilib ko'rsatadi. Ya'ni
 * yashirish CLIENT ishi emas.
 */



export const DrillProvider = ({ children, baseFilters: initialFilters = {} }) => {
  const [stack, setStack] = useState([]);
  /**
   * SAHIFANING JORIY FILTRLARI (davr, filial, kesim).
   *
   * Provider ilova qobig'ida turadi, filtrlar esa SAHIFADA (masalan
   * moliya sahifasidagi davr tanlagichi). Shuning uchun sahifa
   * `useDrillFilters(filters)` orqali ularni shu yerga E'LON qiladi.
   *
   * Aks holda panel har doim "joriy oy" ni ko'rsatardi: foydalanuvchi
   * iyulni tanlab, iyul raqamini bosganda avgust tafsiloti ochilardi —
   * eng yomon turdagi nosozlik, chunki u XATO BERMAYDI.
   */
  const [baseFilters, setBaseFilters] = useState(initialFilters);

  const open = useCallback((node) => {
    if (!node?.type) return;
    setStack((prev) => {
      // Bir xil tugun ustma-ust bosilsa (ikki marta bosish) — takrorlamaymiz.
      const top = prev[prev.length - 1];
      if (top && top.type === node.type && top.id === node.id) return prev;
      return [...prev, node];
    });
  }, []);

  /** Butun zanjirni tashlab, yangisini boshlaydi. */
  const openRoot = useCallback((node) => {
    if (!node?.type) return;
    setStack([node]);
  }, []);

  const back = useCallback(() => setStack((prev) => prev.slice(0, -1)), []);

  /** Breadcrumb'dagi N-tugunga qaytish. */
  const goTo = useCallback(
    (index) => setStack((prev) => prev.slice(0, index + 1)),
    [],
  );

  const close = useCallback(() => setStack([]), []);

  const value = useMemo(
    () => ({
      stack,
      current: stack[stack.length - 1] || null,
      depth: stack.length,
      baseFilters,
      open,
      openRoot,
      back,
      goTo,
      close,
      setBaseFilters,
      isOpen: stack.length > 0,
    }),
    [stack, baseFilters, open, openRoot, back, goTo, close],
  );

  return <DrillContext.Provider value={value}>{children}</DrillContext.Provider>;
};

export default DrillProvider;
