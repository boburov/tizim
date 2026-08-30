/**
 * DRILL-DOWN MANZILLARI - executive qatlamdan operatsion panelga.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BITTA FAYL, har kartada qo'lda yozilgan `to="..."` emas
 *
 * Executive ekranning butun ma'nosi shunda: karta ko'rsatadi, bosilsa
 * ISH QILINADIGAN sahifaga olib boradi. Ya'ni har bir manzil
 * HAQIQATAN mavjud bo'lishi shart - 404 ga olib boradigan bitta
 * karta butun ekranga bo'lgan ishonchni yo'qotadi ("demak bu
 * raqamlar ham to'g'ri emas").
 *
 * Manzillar sahifalar bo'ylab sochilib ketsa, `/owner` marshrutlari
 * o'zgarganda ularni topib chiqish imkonsiz bo'ladi. Shu yerda esa
 * bitta ro'yxat: `owner/routes/index.jsx` o'zgarsa, tekshiriladigan
 * joy bitta.
 *
 * HAR MANZIL `owner/routes/index.jsx` GA QARAB TEKSHIRILGAN.
 * Tuzoqlar (ular haqiqatan ham shu yerda tutildi):
 *   • o'qituvchi maoshi  -> `maoshlar`, `maosh` EMAS
 *   • xodimlar oyligi    -> `/staff/maoshlar`, `/staff/payroll` EMAS
 *   • moliya hisoboti    -> `/finance/accounting`, `/finance-report` EMAS
 *   • o'qituvchi kartasi -> `/users/:id`, `/teachers/:id` EMAS
 *     (o'qituvchi va xodim tafsiloti UMUMIY sahifada ochiladi)
 * ═══════════════════════════════════════════════════════════════════
 */

const OWNER = "/owner";

export const DRILLDOWN = Object.freeze({
  // ── O'quvchilar ──
  students: `${OWNER}/students`,
  studentPayments: `${OWNER}/students/tolovlar`,
  studentDebtors: `${OWNER}/students/qarzdorlar`,
  studentDiscounts: `${OWNER}/students/chegirmalar`,
  studentStats: `${OWNER}/students/statistika`,
  studentRetention: `${OWNER}/students/chiqib-ketish`,

  // ── Guruhlar va davomat ──
  groups: `${OWNER}/groups`,
  attendance: `${OWNER}/attendance`,
  grades: `${OWNER}/grades`,

  // ── O'qituvchilar / xodimlar ──
  teachers: `${OWNER}/teachers`,
  teacherSalaries: `${OWNER}/teachers/maoshlar`,
  teacherObligations: `${OWNER}/teachers/qoldiqlar`,
  teacherAttendance: `${OWNER}/teachers/davomat`,
  staff: `${OWNER}/staff`,
  staffPayroll: `${OWNER}/staff/maoshlar`,
  staffKpi: `${OWNER}/staff/kpi`,

  // ── Moliya ──
  financeReport: `${OWNER}/finance/accounting`,
  writeOffs: `${OWNER}/finance/write-offs`,
  cashDesk: `${OWNER}/cash-desk`,
  expenseApprovals: `${OWNER}/expense-approvals`,

  // ── Sotuv (lidlar) ──
  // `owner/routes/index.jsx:267` — `leads` tabli sahifa, `leads/stats`
  // esa uning statistika tabi. Kesim sahifasidan RO'YXATGA olib
  // boriladi: rahbariyat "qaysi lid?" degan savolga tushadi, "yana
  // bitta statistika" ga emas.
  leads: `${OWNER}/leads`,
  leadStats: `${OWNER}/leads/stats`,

  // ── Filiallar va tahlil ──
  branches: `${OWNER}/branches`,
  branchAnalytics: `${OWNER}/branch-analytics`,
  branchCompare: `${OWNER}/branches/compare`,

  // ── Tahlil markazi ──
  ai: `${OWNER}/ai`,
  aiReports: `${OWNER}/ai/reports`,
  aiTasks: `${OWNER}/ai/tasks`,

  // ── Operatsion panelning o'zi ──
  operationalHome: `${OWNER}/dashboard`,
});

/**
 * Foydalanuvchi kartasi. O'qituvchi ham, xodim ham UMUMIY
 * `/owner/users/:id` sahifasida ochiladi - `/owner/teachers/:id`
 * degan marshrut MAVJUD EMAS.
 *
 * ID bo'lmasa ro'yxatga qaytadi: `/owner/users/undefined` 404 bo'lardi.
 */
export const userHref = (id) => (id ? `${OWNER}/users/${id}` : `${OWNER}/staff`);

/** Guruh kartasi. */
export const groupHref = (id) => (id ? `${OWNER}/groups/${id}` : DRILLDOWN.groups);

/**
 * Filial.
 *
 * ATAYLAB ID QABUL QILMAYDI. `/owner/branches/stats` sahifasi filialni
 * URL'dan emas, FAOL FILIAL kontekstidan oladi (`useActiveBranch`) -
 * ya'ni `?branchId=...` yozish mumkin edi, lekin sahifa uni umuman
 * o'qimaydi va foydalanuvchi boshqa filial ma'lumotini ko'rardi.
 *
 * Ishlamaydigan chuqur havola berish o'rniga ro'yxatga olib boramiz.
 */
export const branchHref = () => DRILLDOWN.branches;


/**
 * ══════════════════════════════════════════════════════════════════════
 * HAVOLALAR — ENDI HAMMA UCHUN TIRIK
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── ILGARI NIMA BO'LGAN ──
 * Yuqoridagi manzillarning HAMMASI Admin panelida (`/owner/*`), va
 * `AdminPanelGuard` tashkilot darajasidagi odamni u yerdan QAYTARARDI.
 * Ya'ni Super Admin panelida bu havolalar "yolg'on eshik" edi:
 * bosiladi, lekin odam darhol `/org` ga otiladi. Shuning uchun
 * `useDrilldown()` unga BO'SH xarita qaytarar, `DashboardSection`
 * (`{to && ...}`) esa havolani umuman chizmasdi.
 *
 * ── NEGA O'ZGARDI ──
 * `AdminPanelGuard` endi egani `/owner/*` dan QAYTARMAYDI va ega
 * o'zining kundalik ishini aynan o'sha panelda bajaradi
 * (`resolveWorkspace` → `ADMIN`). Eshik ochiq bo'lgach, havolani
 * o'chirib turishning sababi qolmadi — aksincha, bo'sh xarita endi
 * EGAGA BOSILMAYDIGAN RAQAMLAR ko'rsatardi.
 *
 * `/org` sahifalaridan `/org/*` ga bosilganda odam boshqa qobiqqa
 * o'tadi. Bu MAQBUL: o'tish foydalanuvchi BOSGANIDA sodir bo'ladi
 * (avtomatik otish emas) va orqaga qaytish uchun sarlavhada
 * "Markaz ko'rinishi" havolasi bor.
 *
 * ⚠ Bu funksiya ataylab saqlanib qoldi: chaqiruv joylari (o'nlab
 * karta) o'zgarmasin va kelajakda ko'lamga qarab yana kesish kerak
 * bo'lsa, u yana BITTA joyda bo'lsin.
 */
export const useDrilldown = () => DRILLDOWN;

/** Odam kartasiga havola. */
export const useUserHref = () => {
  const map = useDrilldown();
  return (id) => (map.staff ? userHref(id) : null);
};
