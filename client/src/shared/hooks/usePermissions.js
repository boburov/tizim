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
