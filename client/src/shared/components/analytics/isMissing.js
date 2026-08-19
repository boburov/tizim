/**
 * Qiymat KO'RSATIB BO'LMAYDIGAN holatda ekanini aniqlaydi.
 *
 * `0` va `false` MISSING EMAS — ular haqiqiy o'lchov natijasi
 * (`dataStatus.js` dagi `isEmptyResult` bilan bir xil qoida).
 * `NaN`/`Infinity` esa hisob xatosining belgisi va ular ekranga
 * chiqmasligi kerak.
 *
 * Alohida faylda: komponent fayllari faqat komponent eksport qilishi
 * kerak (react-refresh qoidasi).
 */
export const isMissing = (v) =>
  v === null || v === undefined || v === "" ||
  (typeof v === "number" && !Number.isFinite(v));

export default isMissing;
