// Bo'lim jadvali mantiqi: qatorlar = modullar, ustunlar = amallar.
//
// ASOSIY QOIDA: faqat MAVJUD kataklar hisoblanadi. Modulda "delete" amali
// bo'lmasa - u katak bo'sh chiziladi va "hammasi belgilanganmi" hisobiga
// KIRMAYDI (aks holda qator hech qachon to'liq belgilanmagan ko'rinardi).
//
// Ustunlar butun tizim bo'yicha emas, HAR BO'LIM uchun alohida hisoblanadi:
// shunda Moliyada 3 ta, Asosiyda 5 ta ustun chiqadi va jadval bo'sh
// kataklar bilan to'lib ketmaydi.

import { SWITCH_STATE } from "../components/PermissionSwitch";
import { READ_ACTION } from "./access.utils";

const stateOf = (total, chosen) => {
  if (total === 0 || chosen === 0) return SWITCH_STATE.OFF;
  return chosen === total ? SWITCH_STATE.ON : SWITCH_STATE.PARTIAL;
};

// Bo'limdagi modullarda uchraydigan amallar, ACTION_ORDER tartibida.
// Tartib serverdan kelgan actions ro'yxatidan olinadi.
export const sectionActions = (items, allActions = []) => {
  const present = new Set();
  items.forEach((m) => Object.keys(m.cells || {}).forEach((a) => present.add(a)));
  return allActions.filter((a) => present.has(a.key));
};

export const rowIds = (module) =>
  Object.values(module.cells || {}).map((c) => c.id);

export const columnIds = (items, actionKey) =>
  items.map((m) => m.cells?.[actionKey]?.id).filter(Boolean);

export const gridIds = (items) => items.flatMap((m) => rowIds(m));

export const getRowState = (module, selected) => {
  const ids = rowIds(module);
  return stateOf(ids.length, ids.filter((id) => selected.has(id)).length);
};

export const getColumnState = (items, actionKey, selected) => {
  const ids = columnIds(items, actionKey);
  return stateOf(ids.length, ids.filter((id) => selected.has(id)).length);
};

export const getGridState = (items, selected) => {
  const ids = gridIds(items);
  return stateOf(ids.length, ids.filter((id) => selected.has(id)).length);
};

// To'liq belgilangan bo'lsa - olib tashlaymiz, aks holda - belgilaymiz.
const applyIds = (selected, ids, turnOn) => {
  const next = new Set(selected);
  ids.forEach((id) => (turnOn ? next.add(id) : next.delete(id)));
  return next;
};

export const toggleIds = (selected, ids) =>
  applyIds(selected, ids, !ids.every((id) => selected.has(id)));

// Bitta katak. "read" bog'liqligi shu yerda ta'minlanadi: har qanday amal
// ko'rish huquqisiz ma'nosiz (foydalanuvchi ro'yxatni ocholmaydi).
export const toggleCell = (selected, module, cell) => {
  const next = new Set(selected);
  const read = module.cells?.[READ_ACTION];

  if (next.has(cell.id)) {
    next.delete(cell.id);
    // Ko'rish olib tashlansa - butun modul yopiladi.
    if (read && cell.id === read.id) rowIds(module).forEach((id) => next.delete(id));
    return next;
  }

  next.add(cell.id);
  if (read) next.add(read.id);
  return next;
};

// Qator sarlavhasi: modulni to'liq yoqish/o'chirish.
export const toggleRow = (selected, module) =>
  toggleIds(selected, rowIds(module));

// Ustun sarlavhasi: shu amalni bo'limdagi barcha modullarda almashtirish.
// Yoqilganda "read" ham qo'shiladi (bog'liqlik saqlanadi).
export const toggleColumn = (selected, items, actionKey) => {
  const ids = columnIds(items, actionKey);
  const turnOn = !ids.every((id) => selected.has(id));
  let next = applyIds(selected, ids, turnOn);

  if (turnOn && actionKey !== READ_ACTION) {
    items.forEach((m) => {
      const read = m.cells?.[READ_ACTION];
      if (read && m.cells?.[actionKey]) next.add(read.id);
    });
  }
  // "read" ustuni o'chirilsa - shu modullar butunlay yopiladi.
  if (!turnOn && actionKey === READ_ACTION) {
    items.forEach((m) => {
      if (m.cells?.[READ_ACTION]) rowIds(m).forEach((id) => next.delete(id));
    });
  }
  return next;
};

export const toggleGrid = (selected, items) => toggleIds(selected, gridIds(items));
