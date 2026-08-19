import { Navigate } from "react-router-dom";

import useWorkspace from "@/shared/hooks/useWorkspace";

/**
 * ISH MAKONI QO'RIQCHISI.
 *
 * ── BU XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi: har so'rovda rol, ruxsat va filial
 * ko'lami tekshiriladi. Bu qo'riqchi faqat ODAMNI TO'G'RI JOYGA
 * olib boradi — o'quvchi tasodifan `/org` ni ochsa, u bo'sh va
 * tushunarsiz ekran o'rniga o'z sahifasiga tushadi.
 *
 * ── HALQA XAVFI ──
 * Yo'naltirish manzili — foydalanuvchining O'Z makonining bosh
 * sahifasi. U har doim mavjud marshrut va o'zi qo'riqlanmaydi,
 * ya'ni "/org → /me → /org" halqasi hosil bo'lmaydi.
 * (Kodbazadagi halqa tarixi: qarang app/routes.jsx.)
 *
 * ── YUKLANISH ──
 * Ruxsatlar `/auth/me` bilan keladi. Kelmaguncha yo'naltirilmaydi,
 * aks holda sahifa har yangilanganda bir zumga noto'g'ri makonga
 * otilib ketardi.
 */
/**
 * @param {object} props
 * @param {string|string[]} props.allow — ruxsat etilgan makonlar
 * @param {boolean} [props.excludeTeacher] — o'qituvchini CHIQARIB tashlaydi
 *
 * `excludeTeacher` nima uchun: o'qituvchi xodim makonida, lekin uning
 * o'z to'liq paneli bor (`/teacher/*`). Operatsion panel (`/owner/*`)
 * unga ilgari ham yopiq edi va bu ATAYLAB — u yerda butun markazning
 * o'quvchi ro'yxati, lidlar va sozlamalar turadi. Ish makoniga o'tish
 * bu chegarani kengaytirmasligi kerak edi.
 */
const WorkspaceGuard = ({ allow, excludeTeacher = false, children }) => {
  const { workspace, home, isTeacher, isLoading } = useWorkspace();
  if (isLoading) return null;

  const allowed = Array.isArray(allow) ? allow : [allow];
  const ok = allowed.includes(workspace) && !(excludeTeacher && isTeacher);
  if (!ok) return <Navigate to={home} replace />;

  return children;
};

export default WorkspaceGuard;
