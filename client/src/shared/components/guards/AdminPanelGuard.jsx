import { Navigate } from "react-router-dom";

import useAuth from "@/shared/hooks/useAuth";
import { ROLE_TYPES } from "@/shared/constants/roles";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ADMIN PANELI — EGA VA DIREKTORLAR UCHUN
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NIMANI TO'SADI ──
 * FAQAT o'quvchi va o'qituvchini: ularning to'liq o'z panellari bor
 * (`/me`, `/teacher`) va operatsion panel ularga hech qachon ochiq
 * emas edi.
 *
 * ── EGA ENDI TO'SILMAYDI (O'ZGARISH) ──
 *
 * Ilgari tashkilot vakolatiga ega odam (`branches.view_all` +
 * `system.admin_access`, yoki `roleType === owner`) `/owner/*` dan
 * `/org` ga QAYTARILARDI. Devor ikki tomonlama edi va bu ATAYLAB
 * shunday qilingan (izohi shu faylda va `client/CLAUDE.md` da).
 *
 * Amalda u boshqacha his qilindi: admin panelga kirmoqchi bo'lgan ega
 * `/org` ga otilib, keyin qo'lda qaytib kelardi. Foydalanuvchi buni
 * "superadminga otib keyin qayta adminga sakrash" deb ta'rifladi.
 *
 * YANGI QOIDA: qo'riqchi MENYUNI belgilaydi, KIRISHNI emas.
 *   • ega `/owner` da yashaydi (`resolveWorkspace` → `ADMIN`);
 *   • `/org` yo'qolmadi — u "Markaz ko'rinishi" havolasi orqali
 *     ochiladi (`AppHeader`) va `SuperAdminGuard` uni qo'riqlaydi;
 *   • yakka filialli nashrda (`MULTI_BRANCH=false`) `/org` umuman
 *     yo'q, ya'ni bu yerda qaytarish CHEKSIZ SAKRASH bo'lardi.
 *
 * ⚠ `useDrilldown()` ham shunga qarab tuzatildi: u tashkilot
 * darajasidagi odamga bo'sh xarita qaytarardi (chunki havolalar
 * `/owner/*` ga borardi va o'sha paytda u yopiq edi). Ega endi
 * `/owner` da bo'lgani uchun havolalar TIRIK bo'lishi kerak.
 *
 * ── XODIM ──
 * Xodim (resepshin) ilgarigidek to'silmaydi: uning menyusi `/work`,
 * lekin bir nechta operatsion sahifa o'sha menyudan ochiladi.
 *
 * ── BU XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi (rol + ruxsat + filial ko'lami, har
 * so'rovda). Bu qo'riqchi odamni to'g'ri panelda ushlab turadi, xolos.
 */
const AdminPanelGuard = ({ children }) => {
  const auth = useAuth();

  if (auth.isLoading) return null;

  const type = auth.roleType || auth.role;

  if (type === ROLE_TYPES.STUDENT) return <Navigate to="/me" replace />;
  if (type === ROLE_TYPES.TEACHER) return <Navigate to="/teacher" replace />;

  return children;
};

export default AdminPanelGuard;
