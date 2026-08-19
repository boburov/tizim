// Hooks
import useAuth from "@/shared/hooks/useAuth";

// RUXSAT IYERARXIYASI - server bilan AYNAN BIR XIL bo'lishi shart
// (server/src/helpers/permission.helper.js: PERMISSION_IMPLIES).
//
// Nega kerak: `leads.manage` bor eski rollarning ruxsat massivida
// `leads.create` YO'Q - u kecha mavjud emasdi. Iyerarxiyasiz client
// "Yangi lid" tugmasini YASHIRARDI, holbuki server so'rovni QABUL
// qilardi. Foydalanuvchi huquqi bor amalni bajara olmay qolardi.
const PERMISSION_IMPLIES = {
  "leads.manage": ["leads.create", "leads.update"],

  // ── MOLIYA KALITLARI QAYTA NOMLANGANDA ──
  // Serverda `expenses.create` / `expenses.manage` `finance.*` nomlariga
  // ko'chdi va eski kalitlar yangilarini QAMRAB oladi. Bu ro'yxat o'sha
  // moslikni takrorlaydi — aks holda `expenses.create` bor xodimda
  // "Chiqim qo'shish" tugmasi YASHIRINARDI, holbuki server so'rovni
  // qabul qilardi.
  "expenses.create": ["finance.create_expense"],
  "expenses.manage": ["finance.manage_expense", "finance.create_expense"],
  "finance.manage": ["finance.manage_accounts", "finance.manage_refunds"],
  "finance.pay": ["finance.manage_transfers"],

  // DIQQAT: `view_*` kalitlari ATAYLAB YO'Q. Serverda ham `finance.read`
  // ularni qamramaydi (foydalilik maosh tannarxini ochadi). Bu yerga
  // qo'shilsa client server RUXSAT BERMAYDIGAN bo'limni ko'rsatib,
  // foydalanuvchini 403 ga olib borardi.
};

const usePermissions = () => {
  const { permissions, isOwner } = useAuth();

  const has = (key) => {
    if (isOwner) return true;
    if (!key) return false;
    if (permissions.includes(key)) return true;
    return Object.entries(PERMISSION_IMPLIES).some(
      ([parent, children]) =>
        children.includes(key) && permissions.includes(parent),
    );
  };

  const hasAny = (keys = []) => keys.some(has);
  const hasAll = (keys = []) => keys.every(has);

  return { permissions, has, hasAny, hasAll };
};

export default usePermissions;
