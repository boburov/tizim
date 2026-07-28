// Ruxsat hisoblari va "read" bog'liqligi.
//
// MUHIM QOIDA: "read" - kalit amal. Ko'rish huquqisiz yaratish/tahrirlash
// ma'nosiz (foydalanuvchi ro'yxatni ocholmaydi). Shuning uchun istalgan
// amal belgilansa "read" avtomatik yoqiladi, "read" olib tashlansa esa
// butun modul yopiladi. Bu qoida grid.utils.js dagi toggle'larda amalga
// oshiriladi.

export const READ_ACTION = "read";

// Shablonlar (presets.js) uchun modulga kirish darajasi.
export const ACCESS_LEVEL = Object.freeze({
  NONE: "none",
  READ: "read",
  FULL: "full",
});

export const modulePermissionIds = (module) =>
  Object.values(module?.cells || {}).map((c) => c.id);

export const countModuleSelected = (module, selected) =>
  modulePermissionIds(module).filter((id) => selected.has(id)).length;

export const countSelectedIn = (modules, selected) =>
  modules.reduce((sum, m) => sum + countModuleSelected(m, selected), 0);

export const countTotalIn = (modules) =>
  modules.reduce((sum, m) => sum + modulePermissionIds(m).length, 0);

// Modulni butun darajaga qo'yish - shablonlar shu orqali ishlaydi.
export const setModuleLevel = (selected, module, level) => {
  const next = new Set(selected);
  const ids = modulePermissionIds(module);
  if (!ids.length) return next;

  if (level === ACCESS_LEVEL.FULL) {
    ids.forEach((id) => next.add(id));
    return next;
  }

  ids.forEach((id) => next.delete(id));
  if (level === ACCESS_LEVEL.NONE) return next;

  // READ: faqat ko'rish huquqi. "read" yo'q modulda eng birinchi
  // (eng zaif) amalni beramiz.
  const read = module.cells?.[READ_ACTION];
  next.add(read ? read.id : ids[0]);
  return next;
};

// Tanlov o'zgarganini aniqlash (saqlanmagan o'zgarishlar ogohlantirishi).
export const isSameSelection = (a, b) => {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};
