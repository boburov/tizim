// Hooks
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

// Kategoriya -> qaror qabul qilish uchun kerakli ruxsat.
// Server ham AYNAN shu qoidani qo'llaydi (assertCanDecide).
const DECIDE_PERMISSION = {
  financial: PERMISSIONS.FINANCE_APPROVE,
  configuration: PERMISSIONS.APPROVALS_DECIDE_CONFIG,
};

/**
 * Tasdiq so'rovi ustidan qanday amallar mumkinligini hisoblaydi.
 *
 * NEGA ALOHIDA HOOK: ✓/✗ tugmalari TO'RT joyda chiqadi - jadval, batafsil
 * paneli, bildirishnoma toast'i va kirish modalida. Mantiq har birida
 * qayta yozilsa, birini yangilab boshqasini unutish xavfsizlik teshigi
 * ochardi (masalan o'zini-o'zi tasdiqlash taqiqi bir joyda tushib qolishi).
 *
 * DIQQAT: bu FAQAT UI uchun - haqiqiy himoya serverda. Bu yerda tugmani
 * yashirish maqsadi foydalanuvchini 403 bilan urmaslik.
 */
const useApprovalPermissions = () => {
  const { user } = useAuth();
  const { has } = usePermissions();

  const resolve = (approval) => {
    if (!approval) {
      return { canDecide: false, canCancel: false, canRetry: false, reason: "" };
    }

    const isPending = approval.status === "pending";
    const isFailed = approval.status === "failed";
    const isOwnRequest =
      String(approval.requestedBy?._id || approval.requestedBy) ===
      String(user?._id);

    const needed =
      DECIDE_PERMISSION[approval.category] || PERMISSIONS.FINANCE_APPROVE;
    const hasDecidePermission = has(needed);

    const canDecide = hasDecidePermission && isPending && !isOwnRequest;
    const canCancel = isPending && isOwnRequest;
    const canRetry = hasDecidePermission && isFailed;

    // Checkbox o'chiq turganda tooltip'da ko'rsatiladigan SABAB - foydalanuvchi
    // "nega bosilmayapti" deb qolmasligi uchun.
    let reason = "";
    if (!canDecide && isPending) {
      if (isOwnRequest) reason = "O'z so'rovingizni o'zingiz tasdiqlay olmaysiz";
      else if (!hasDecidePermission)
        reason = "Bu turdagi so'rovni tasdiqlash huquqingiz yo'q";
    }

    return { canDecide, canCancel, canRetry, isOwnRequest, reason };
  };

  return { resolve };
};

export default useApprovalPermissions;
