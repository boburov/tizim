export const formatPhone = (phone) => {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 3)} (${cleaned.slice(3, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8, 10)}-${cleaned.slice(10, 12)}`;
  }
  return phone;
};

// "+{998} (00) 000-00-00" maskasi maydonga bir marta tegilsa ham chala qiymat
// qoldiradi ("+998 (90"). Telefon IXTIYORIY bo'lgan joyda bunday qoldiq
// yuborilmasligi kerak: server uni "noto'g'ri raqam" deb rad etadi, ya'ni
// tegib ketilgan bo'sh maydon amalni butunlay to'xtatib qo'yardi.
export const isPhoneComplete = (phone) =>
  String(phone || "").replace(/\D/g, "").length === 12;

// To'liq raqam bo'lsa - o'zi, aks holda null (ya'ni "telefon berilmagan").
export const phoneOrNull = (phone) =>
  isPhoneComplete(phone) ? String(phone).trim() : null;
