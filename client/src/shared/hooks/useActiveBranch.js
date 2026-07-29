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
  const { branches, canSeeAllBranches, homeBranchId, isLoading, multiBranch } =
    useAuth();
  const queryClient = useQueryClient();

  // TANLOV VARIANTLARI SONI.
  //
  // Yakka markaz rejimida (MULTI_BRANCH=false) tanlov umuman yo'q.
  //
  // DIQQAT: "Barcha filiallar" varianti faqat filial ROSTDAN HAM bir nechta
  // bo'lgandagina qo'shiladi. Ilgari `canSeeAllBranches` yolg'iz o'zi ham
  // yetardi, lekin egada bu ruxsat DOIM bor - natijada bir filialli markazda
  // ham "Filialni tanlang" ekrani chiqib, ikkita bir xil variant taklif
  // qilinardi ("Barcha filiallar" va yagona filial).
  const optionCount = !multiBranch
    ? 1
    : branches.length + (canSeeAllBranches && branches.length > 1 ? 1 : 0);

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
    if (optionCount > 1) {
      // Yaroqsiz eski qiymat bo'lsa tozalaymiz, lekin YANGISINI qo'ymaymiz.
      if (branchId) setActiveBranchId(null);
      return;
    }

    // Yagona variant - tanlashning ma'nosi yo'q, darhol qo'yamiz.
    // Bitta filial bo'lsa "barcha filiallar" emas, o'sha filialning o'zini
    // qo'yamiz - ular ayni bir narsa, lekin aniq ID tushunarliroq.
    const only =
      branches.length === 1
        ? branches[0]._id
        : canSeeAllBranches
          ? ALL_BRANCHES
          : branches[0]?._id || homeBranchId;
    if (only) setActiveBranchId(only);
  }, [
    branchId,
    branches,
    canSeeAllBranches,
    homeBranchId,
    isLoading,
    optionCount,
  ]);

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
  const needsBranchChoice = !isLoading && optionCount > 1 && !branchId;

  return {
    branchId,
    activeBranch,
    branches,
    canSeeAllBranches,
    needsBranchChoice,
    isAllBranches: branchId === ALL_BRANCHES,
    // Ko'p filialli rejim yoqilganmi (server env). Filial bo'limi, "Filial
    // qo'shish" kabi BOSHQARUV elementlari shunga qarab ko'rsatiladi.
    multiBranch,
    // Filialga oid MA'LUMOT elementlarini (tanlagich, jadval ustuni, forma
    // maydoni) ko'rsatish kerakmi. Bitta filialda ular doim bir xil qiymat -
    // faqat shovqin. `canSeeAllBranches` bu yerda YETARLI EMAS: egada u
    // doim true, shuning uchun filial soni bo'yicha qaraymiz.
    hasMultipleBranches: multiBranch && branches.length > 1,
    changeBranch,
  };
};

export default useActiveBranch;
