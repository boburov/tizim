import FinanceCommandPage from "@/owner/features/financeAnalytics/pages/FinanceCommandPage";

/**
 * FILIAL MOLIYASI.
 *
 * AYNI SAHIFA, BOSHQA KO'LAM. Server har so'rovni foydalanuvchining
 * filial ko'lami bilan kesadi (`branchFilter` → `AND FALSE` fail-closed),
 * ya'ni direktor shu ekranda O'Z filialining raqamlarini ko'radi.
 *
 * ── NEGA ALOHIDA "FILIAL MOLIYASI" KOMPONENTI YOZILMADI ──
 * Yozilsa, ikkita moliya ekrani bo'lardi va ular vaqt o'tishi bilan
 * boshqacha hisoblay boshlardi — moliyada bu tizimga bo'lgan ishonchni
 * butunlay yo'q qiladi. Ko'lam FILTR, ekran emas.
 */
const BranchFinancePage = () => <FinanceCommandPage />;

export default BranchFinancePage;
