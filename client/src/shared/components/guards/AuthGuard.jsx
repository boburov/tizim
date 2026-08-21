// React
import { useEffect } from "react";

// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useWorkspace from "@/shared/hooks/useWorkspace";

// Lib
import { ALL_BRANCHES } from "@/shared/lib/branch/activeBranch";

// Utils
import { extractApiErrorMessage } from "@/shared/utils/apiError";

// Components
import Button from "@/shared/components/ui/button/Button";
import BranchPicker from "@/shared/components/branch/BranchPicker";

const Centered = ({ children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
    {children}
  </div>
);

/**
 * Sessiya tugamagan, lekin /auth/me olinmadi (tarmoq, 5xx, timeout).
 *
 * NEGA logout QILINMAYDI: ilgari HAR QANDAY xato tokenni o'chirib
 * /login ga uloqtirardi. Telegram mini ilovada bu eng ko'p uchraydigan
 * nosozlik edi - foydalanuvchi kirardi, birinchi so'rov yiqilardi va uni
 * darhol qaytarib yuborardi, sababi esa hech qayerda ko'rinmasdi.
 * Token o'z joyida qoladi, foydalanuvchi qayta urinadi.
 */
const ConnectionError = ({ error, onRetry }) => (
  <Centered>
    <div className="w-full max-w-sm text-center space-y-3">
      <h1 className="text-lg font-semibold">Ma'lumot olinmadi</h1>
      <p className="text-sm text-muted-foreground">
        {extractApiErrorMessage(
          error,
          "Server bilan bog'lanib bo'lmadi. Internetni tekshirib, qayta urining.",
        )}
      </p>
      {/* Diagnostika: TG WebView'da DevTools yo'q, shuning uchun holat kodi
          ekranda ko'rinadi - aks holda sabab noma'lum qolardi. */}
      <p className="text-xs text-muted-foreground">
        Holat: {error?.response?.status || "tarmoq xatosi"}
      </p>
      <Button onClick={onRetry} className="w-full">
        Qayta urinish
      </Button>
    </div>
  </Centered>
);

const AuthGuard = () => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const { isLoading, isError, isSessionExpired, error, refetch } = useAuth();
  const { needsBranchChoice, branchId, changeBranch } = useActiveBranch();
  const { isSuperAdmin } = useWorkspace();

  // ═══════════════════════════════════════════════════════════════════
  // SUPERADMIN — FILIAL TANLASH EKRANI KO'RSATILMAYDI.
  //
  // Tashkilot paneli (`/org`) ta'rifi bo'yicha BUTUN tashkilot bo'yicha
  // ishlaydi. Undan "qaysi filialda ishlaysiz?" deb so'rash mantiqan
  // ortiqcha: keyingi ekranning o'zi baribir hamma filialni birga
  // ko'rsatadi.
  //
  // ⚠ NEGA `null` QOLDIRILMAYDI, "barcha filiallar" QO'YILADI:
  // server `x-branch-id` bo'lmasa ham `branches.view_all` egasiga
  // butun tashkilot ko'lamini beradi — ya'ni SO'ROV natijasi bir xil.
  // LEKIN klientda `isAllBranches` `false` bo'lib qolardi va
  // foydalanuvchi admin paneliga (`/owner`) o'tganda formalar majburiy
  // "Filial" maydonini KO'RSATMASDI — natijada u qaysi filialga
  // yozayotganini bilmay qolardi. Holat OCHIQ bo'lgani yaxshi.
  //
  // ⚠ TANLASH IMKONIYATI YO'QOLMAYDI: yon panel tanlagichi joyida
  // qoladi, ya'ni superadmin xohlasa aniq filialga o'tishi mumkin.
  useEffect(() => {
    if (isSuperAdmin && needsBranchChoice && !branchId) {
      changeBranch(ALL_BRANCHES);
    }
  }, [isSuperAdmin, needsBranchChoice, branchId, changeBranch]);

  if (!token) return <Navigate to="/login" replace />;

  if (isLoading) {
    return (
      <Centered>
        <div className="size-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </Centered>
    );
  }

  // Sessiya ROSTDAN tugagan (401/403) - token o'chiriladi.
  if (isSessionExpired) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("authToken");
    }
    return <Navigate to="/login" replace />;
  }

  // Vaqtinchalik nosozlik - sessiya saqlanadi.
  if (isError) return <ConnectionError error={error} onRetry={refetch} />;

  // FILIAL TANLASH: bir nechta filiali borlar avval qaysi biri bilan
  // ishlashini tanlaydi. Bitta filiali borlar bu ekranni ko'rmaydi.
  //
  // ⚠ SUPERADMIN ham ko'rmaydi (yuqoridagi izohga qarang) — ekran
  // umuman CHIZILMAYDI, aks holda effekt ishlaguncha u bir lahza
  // "chaqnab" ketardi.
  if (needsBranchChoice && !isSuperAdmin) return <BranchPicker />;

  return <Outlet />;
};

export default AuthGuard;
