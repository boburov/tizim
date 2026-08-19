import FinanceCommandPage from "@/owner/features/financeAnalytics/pages/FinanceCommandPage";

/**
 * MOLIYA — TASHKILOT DARAJASIDA (talab 8).
 *
 * ── NEGA QAYTA YOZILMADI ──
 * `FinanceCommandPage` allaqachon talab so'ragan bo'limlarni
 * beradi: Umumiy, Daromad, Chiqim, Foydalilik, Pul, Qarzdorlik,
 * Byudjet — plus ogohlantirishlar. Uni ikkinchi marta yozish
 * ikkita moliya ekrani degani va ular MUQARRAR ajralib ketardi.
 *
 * O'ZGARGANI — O'RNI. Ilgari u "Moliya > Boshqaruv markazi"
 * degan ikki qadamli menyu ostida edi va yonida yana uchta
 * moliyaviy havola turardi ("Hisobot & statistika", "To'lovlar",
 * "Kassa"), ya'ni foydalanuvchi qaysi biri "asosiy" ekanini
 * bilmasdi. Endi Moliya — sidebar'ning BITTA yozuvi va shu
 * sahifa uning yagona kirish nuqtasi.
 */
const MoliyaPage = () => <FinanceCommandPage />;

export default MoliyaPage;
