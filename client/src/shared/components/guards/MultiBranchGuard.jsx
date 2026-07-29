// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

/**
 * Faqat KO'P FILIALLI rejimda ochiladigan sahifalar (filial ro'yxati,
 * taqqoslash, filiallar kesimidagi statistika).
 *
 * Yakka markazda bu sahifalar chalg'itadi: sidebarda ular yo'q, lekin eski
 * xatcho'p yoki qo'lda yozilgan URL baribir ochib yuborardi. Markazning
 * o'z ma'lumoti Sozlamalar > Markaz ma'lumotlari'da.
 */
const MultiBranchGuard = ({ children, fallback = "/owner/settings/markaz" }) => {
  const { multiBranch, isLoading } = useAuth();

  // Ruxsatlar /auth/me bilan keladi - yuklanmaguncha redirect qilmaymiz,
  // aks holda sahifa har yangilanganda fallback'ga otilib ketardi.
  if (isLoading) return null;
  if (!multiBranch) return <Navigate to={fallback} replace />;

  return children || <Outlet />;
};

export default MultiBranchGuard;
