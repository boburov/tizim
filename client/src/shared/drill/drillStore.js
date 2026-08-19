import { createContext } from "react";

/**
 * Drill panelining React konteksti.
 *
 * ALOHIDA FAYLDA: `react-refresh` qoidasi komponent faylidan faqat
 * komponent eksport qilinishini talab qiladi. Kontekst komponent
 * emas, ya'ni provider bilan bitta faylda tursa hot-reload holatni
 * (ochiq panel, zanjir) har saqlashda yo'qotardi.
 */
export const DrillContext = createContext(null);

export default DrillContext;
