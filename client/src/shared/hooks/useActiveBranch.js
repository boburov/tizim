// React
import { useCallback, useEffect, useSyncExternalStore } from "react";

// TanStack Query
import { useQueryClient } from "@tanstack/react-query";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Lib
import {
  ALL_BRANCHES,
  getActiveBranchId,
  setActiveBranchId,
  subscribeActiveBranch,
  isBranchIdValid,
} from "@/shared/lib/branch/activeBranch";

/**
 * Aktiv filialni boshqarish.
 *
 * Filial almashganda BARCHA query'lar bekor qilinadi - aks holda ekranda
 * eski filial ma'lumoti qolib ketardi (kesh query key'da branchId yo'q).
 */
const useActiveBranch = () => {
  const { branches, canSeeAllBranches, homeBranchId, isLoading } = useAuth();
  const queryClient = useQueryClient();

  // UMUMIY holat (useState EMAS).
  //
  // Bu hook bir nechta komponentda chaqiriladi (AuthGuard, AppSidebar,
  // UsersTable...). useState bo'lsa har biri O'Z nusxasini tutardi va
  // BranchPicker'da tanlangan filial AuthGuard'ga yetib bormasdi -
  // tanlash ekrani yopilmay qolardi.
  const branchId = useSyncExternalStore(
    subscribeActiveBranch,
    getActiveBranchId,
    getActiveBranchId,
  );

  // Saqlangan filial yaroqsiz bo'lsa (foydalanuvchi filialdan chiqarilgan,
  // filial o'chirilgan) - standart qiymatga qaytamiz, aks holda har so'rov
  // 403 bilan qaytardi.
  useEffect(() => {
    if (isLoading) return;
    if (!branches.length && !canSeeAllBranches) return;

    const valid = isBranchIdValid(branchId, { branches, canSeeAllBranches });
    if (valid) return;

    // TANLASH EKRANI: bir nechta variant bo'lsa foydalanuvchi O'ZI tanlaydi
    // (BranchPicker ko'rsatiladi). Avtomatik tanlash uni chalg'itardi -
    // qaysi filialda ishlayotganini bilmay qolardi.
    const optionCount = branches.length + (canSeeAllBranches ? 1 : 0);
    if (optionCount > 1) {
      // Yaroqsiz eski qiymat bo'lsa tozalaymiz, lekin YANGISINI qo'ymaymiz.
      if (branchId) setActiveBranchId(null);
      return;
    }

    // Yagona variant - tanlashning ma'nosi yo'q, darhol qo'yamiz.
    const only = canSeeAllBranches ? ALL_BRANCHES : branches[0]?._id || homeBranchId;
    if (only) setActiveBranchId(only);
  }, [branchId, branches, canSeeAllBranches, homeBranchId, isLoading]);

  const changeBranch = useCallback(
    (next) => {
      setActiveBranchId(next ? String(next) : null);
      // Filial o'zgardi - butun kesh eskirdi.
      //
      // DIQQAT: argumentsiz invalidateQueries() /auth/me ni ham qamraydi -
      // bu SHART. Foydalanuvchi filialga qarab boshqa rolda bo'lishi mumkin
      // (A da direktor, B da o'qituvchi), ya'ni ruxsatlar ham o'zgaradi.
      // /auth/me yangilanmasa UI eski ruxsatlar bilan qolib, ko'rinadigan
      // tugma bosilganda 403 berardi.
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const activeBranch =
    branchId && branchId !== ALL_BRANCHES
      ? branches.find((b) => String(b._id) === String(branchId)) || null
      : null;

  // Tanlash ekrani kerakmi: variant ko'p, lekin hali tanlanmagan.
  const optionCount = branches.length + (canSeeAllBranches ? 1 : 0);
  const needsBranchChoice = !isLoading && optionCount > 1 && !branchId;

  return {
    branchId,
    activeBranch,
    branches,
    canSeeAllBranches,
    needsBranchChoice,
    isAllBranches: branchId === ALL_BRANCHES,
    // Tanlagichni ko'rsatish kerakmi: bitta filial bo'lsa keraksiz.
    hasMultipleBranches: branches.length > 1 || canSeeAllBranches,
    changeBranch,
  };
};

export default useActiveBranch;
