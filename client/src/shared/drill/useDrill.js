import { useContext, useEffect } from "react";
import { DrillContext } from "./drillStore";

/**
 * Drill panelini boshqarish.
 *
 * Provider'siz ishlatilganda XATO BERMAYDI — bo'sh amallar qaytaradi.
 * Sabab: jadval komponentlari ilovaning istalgan joyida ishlatiladi
 * va ularning ba'zilari (masalan sozlama sahifasidagi) drill
 * kontekstida bo'lmasligi mumkin. Xato o'rniga — jimgina bosilmaydigan
 * qator.
 */
export const useDrill = () => {
  const ctx = useContext(DrillContext);
  return (
    ctx || {
      stack: [],
      current: null,
      depth: 0,
      baseFilters: {},
      open: () => {},
      openRoot: () => {},
      back: () => {},
      goTo: () => {},
      close: () => {},
      setBaseFilters: () => {},
      isOpen: false,
      unavailable: true,
    }
  );
};

/**
 * Sahifaning filtrlarini drill paneliga E'LON qiladi.
 *
 * Sahifa ochilganda va filtr o'zgarganda chaqiriladi. `JSON.stringify`
 * qiyoslashi ataylab: filtr obyekti har render'da yangi bo'ladi va
 * referens bo'yicha taqqoslash cheksiz halqa berardi.
 */
export const useDrillFilters = (filters) => {
  const { setBaseFilters } = useDrill();
  const serialized = JSON.stringify(filters || {});
  useEffect(() => {
    setBaseFilters(JSON.parse(serialized));
  }, [serialized, setBaseFilters]);
};

export default useDrill;
