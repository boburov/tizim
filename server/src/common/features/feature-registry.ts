/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODUL IMKONIYATLARI REYESTRI — LOYIHA BO'YICHA YOQIB/O'CHIRILADIGAN
 * BO'LIMLAR RO'YXATI.
 *
 * ⚠ QO'LDA TAHRIRLANMAYDI (META va imkoniyatlardan tashqari).
 * Ro'yxat kod grafigidan generatsiya qilinadi:
 *
 *     node scripts/gen-feature-registry.mjs > src/common/features/feature-registry.ts
 *
 * Sabab: `requires` — haqiqiy `@Module({ imports: [...] })` grafigining
 * proyeksiyasi. Qo'lda yozilsa u KODDAN AJRALIB QOLARDI va dev panel
 * "o'chirish xavfsiz" deb aytgan joyda mijozning maoshi noto'g'ri
 * hisoblanardi. `test/feature-graph.test.mjs` mosligini har yurishda
 * tekshiradi.
 *
 * ── NEGA `PERMISSIONS` GA QO'SHILMAYDI ──
 *
 * `common/constants/permissions.ts` PARITET ORAKULI bilan muzlatilgan —
 * unga kalit qo'shilsa uchta tekshiruv qizil bo'ladi. Yangi bo'lim O'Z
 * REYESTRINI olib yuradi (`common/constants/coin.ts` dagidek).
 *
 * ── RUXSAT EMAS, LITSENZIYA ──
 *
 * `Permission` — "menda shu ishga HAQ bormi" (rol). Bu reyestr —
 * "bu bo'lim shu loyihada UMUMAN BORMI" (tarif). Ikkisi ORTOGONAL.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Bo'limni o'chirish qanchalik xavfli (grafikdan hisoblanadi).
 *
 *  • `leaf`         — uni HECH KIM import qilmaydi.
 *  • `near-leaf`    — 1-2 chaqiruvchi.
 *  • `load-bearing` — 3+ modul unga tayanadi.
 */
export type FeatureTier = 'leaf' | 'near-leaf' | 'load-bearing';

export interface FeatureDef {
  /** Tarif kaliti. Modul uchun — modul papkasi nomi. */
  key: string;
  /**
   * Ota kalit — faqat IMKONIYAT (capability) uchun.
   *
   * ⚠ QAT'IY QOIDA: otasi o'chiq bo'lsa bola HAM o'chiq. Bu yechishda
   * majburlanadi, intizomga tashlab qo'yilmaydi.
   */
  parent?: string;
  /**
   * Ochiq bo'lishi SHART bo'lgan boshqa kalitlar — modul import
   * grafigidan.
   *
   * ⚠ FAQAT `locked` nishonlar KIRMAYDI ('auth', 'features') — ular
   * hech qachon o'chmaydi, ya'ni to'siq sifatida ma'nosiz. `core`
   * nishonlar ENDI KIRADI: ular o'chiriladigan bo'ldi va grafiksiz
   * `groups` ni o'chirish `attendance` ni JIMGINA buzardi.
   */
  requires?: string[];
  label: string;
  tier: FeatureTier;
  /**
   * TIZIM O'ZAGI — XAVFLI, LEKIN O'CHIRILADI.
   *
   * ⚠ MA'NOSI O'ZGARDI. Ilgari bu "panelda o'chirgich ko'rsatilmaydi"
   * degani edi. Endi o'chirgich BOR: talab — har bir feature sotiladi
   * va istalganini yoqib-o'chirish mumkin.
   *
   * Nima qoldi: panel bu qatorlarni QIZIL ogohlantirish va qo'shimcha
   * tasdiq bilan ko'rsatadi (`TenantFeatures.jsx`). Tasodifan bosishdan
   * saqlaydi, qaror qabul qilishga xalaqit bermaydi.
   *
   * "O'chirib bo'lmaydi" endi `locked` — pastga qarang.
   */
  core?: boolean;
  /**
   * HECH QACHON O'CHMAYDI — o'chirgich yo'q, API 409 qaytaradi.
   *
   * ATIGI IKKI KALIT, ikki xil sabab bilan:
   *
   *   • `auth` — MAHSULOT qarori. O'chsa tenantga hech kim, hatto ega
   *     ham kira olmaydi; tuzatishning yagona yo'li — bizning panel.
   *
   *   • `features` — TEXNIK zaruriyat. Bu endpoint darvoza ortiga
   *     tushib o'chsa, `GET /features` ning O'ZI 402 qaytaradi:
   *     klient nima o'chganini bilolmaydi, admin server esa
   *     `/internal/entitlements/refresh` bilan ham tuzata olmaydi —
   *     tenant TIKLANMAS holatga tushadi. Bu talabdan chetlanish emas,
   *     talabni bajarish sharti.
   *
   * `global-feature-gate.ts` dagi `NEVER_GATED` ro'yxati bu qarorni
   * marshrut darajasida ham takrorlaydi (ikki qatlamli himoya).
   */
  locked?: boolean;
  /**
   * Darvoza BOSHQA JOYDA qo'yilgan — bu yerda marshrut to'silmaydi.
   * `ai_advisor` shunday: `ai-feature.middleware.ts` uni allaqachon
   * tekshiradi va u ATAYLAB ochiq yiqiladi (tannarx byudjet qatlamida
   * ushlanadi). Ikkinchi darvoza o'sha qarorni buzardi.
   */
  gatedElsewhere?: boolean;
  /**
   * NestJS modul klasslari — grafik testi shular orqali tekshiradi.
   *
   * ⚠ MASSIV, chunki bir-birini import qiladigan modullar (aylana)
   * BITTA kalit ostida birlashtiriladi — aks holda ularning hech
   * birini o'chirib bo'lmasdi.
   */
  nestModules?: string[];
  /** `@Controller(...)` prefikslari — global darvoza shular bo'yicha ishlaydi. */
  routes?: string[];
}

export const FEATURES: readonly FeatureDef[] = Object.freeze([
  {
    key: 'activity-history',
    label: 'Faoliyat tarixi',
    tier: 'leaf',
    nestModules: ['ActivityHistoryModule'],
    routes: ['activity-history'],
  },
  {
    key: 'activity-logs',
    label: 'Audit loglari',
    tier: 'leaf',
    nestModules: ['ActivityLogsModule'],
    routes: ['activity-logs'],
  },
  {
    key: 'admin-dashboard',
    label: 'Boshqaruv paneli',
    tier: 'leaf',
    nestModules: ['AdminDashboardModule'],
    routes: ['admin-dashboard'],
  },
  {
    key: 'ai_advisor',
    label: 'AI maslahatchi',
    tier: 'near-leaf',
    gatedElsewhere: true,
    nestModules: ['AiModule'],
    routes: ['ai'],
  },
  {
    key: 'archive-reasons',
    label: 'Arxiv sabablari',
    tier: 'near-leaf',
    nestModules: ['ArchiveReasonsModule'],
    routes: ['archive-reasons'],
  },
  {
    key: 'assignments',
    label: 'Vazifalar (uy ishi)',
    tier: 'leaf',
    nestModules: ['AssignmentsModule'],
    routes: ['assignments'],
    requires: ['storage'],
  },
  {
    key: 'attendance',
    label: 'Davomat',
    tier: 'near-leaf',
    nestModules: ['AttendanceModule'],
    routes: ['attendance'],
    requires: ['attendance-settings', 'coin', 'groups', 'holidays', 'notifications', 'student-freeze'],
  },
  {
    key: 'attendance-exemptions',
    label: 'Davomat imtiyozlari',
    tier: 'leaf',
    nestModules: ['AttendanceExemptionsModule'],
    routes: ['attendance-exemptions'],
  },
  {
    key: 'attendance-settings',
    label: 'Davomat sozlamalari',
    tier: 'near-leaf',
    nestModules: ['AttendanceSettingsModule'],
    routes: ['attendance-settings'],
  },
  {
    key: 'auth',
    label: 'Autentifikatsiya',
    tier: 'load-bearing',
    core: true,
    locked: true,
    nestModules: ['AuthModule'],
    routes: ['auth'],
  },
  {
    key: 'bot-auth',
    label: 'Telegram orqali kirish',
    tier: 'leaf',
    core: true,
    nestModules: ['BotAuthModule'],
    routes: ['bot-auth'],
  },
  {
    key: 'branch-analytics',
    label: 'Filial tahlili',
    tier: 'near-leaf',
    nestModules: ['BranchAnalyticsModule'],
    routes: ['branch-analytics'],
    requires: ['journal'],
  },
  {
    key: 'branches',
    label: 'Filiallar',
    tier: 'leaf',
    core: true,
    nestModules: ['BranchesModule'],
    routes: ['branches'],
  },
  {
    key: 'coin',
    label: 'Tangalar',
    tier: 'load-bearing',
    nestModules: ['CoinModule'],
    routes: ['coins'],
  },
  {
    key: 'courses',
    label: 'Kurslar katalogi',
    tier: 'near-leaf',
    core: true,
    nestModules: ['CoursesModule'],
    routes: ['courses'],
  },
  {
    key: 'expense-approvals',
    label: 'Chiqim tasdiqlari',
    tier: 'load-bearing',
    core: true,
    nestModules: ['ExpenseApprovalsModule'],
    routes: [],
  },
  {
    key: 'expenses',
    label: 'Chiqimlar',
    tier: 'leaf',
    nestModules: ['ExpensesModule'],
    routes: ['expenses'],
    requires: ['expense-approvals', 'finance', 'storage'],
  },
  {
    key: 'exports',
    label: 'Excel eksport',
    tier: 'leaf',
    nestModules: ['ExportsModule'],
    routes: ['exports'],
    requires: ['finance', 'users'],
  },
  {
    key: 'features',
    label: 'Tarif imkoniyatlari',
    tier: 'leaf',
    core: true,
    locked: true,
    nestModules: ['FeaturesModule'],
    routes: ['features', 'internal/entitlements'],
  },
  {
    key: 'feedback',
    label: 'Fikr-mulohaza',
    tier: 'leaf',
    nestModules: ['FeedbackModule'],
    routes: ['feedback'],
    requires: ['notifications'],
  },
  {
    key: 'feedback-types',
    label: 'Fikr turlari',
    tier: 'leaf',
    nestModules: ['FeedbackTypesModule'],
    routes: ['feedback-types'],
  },
  {
    key: 'finance',
    label: 'Moliya (Oldindan to\'lov, O\'qituvchi maoshi bilan birga)',
    tier: 'load-bearing',
    nestModules: ['DepositsModule', 'FinanceModule', 'TeacherSalaryModule'],
    routes: ['deposits', 'finance', 'teacher-salary'],
    requires: ['courses', 'expense-approvals', 'groups', 'holidays', 'journal', 'student-freeze'],
  },
  {
    key: 'finance-analytics',
    label: 'Moliya tahlili',
    tier: 'leaf',
    nestModules: ['FinanceAnalyticsModule'],
    routes: ['finance-analytics'],
    requires: ['ai_advisor', 'branch-analytics'],
  },
  {
    key: 'finance-ops',
    label: 'Moliya amallari',
    tier: 'leaf',
    nestModules: ['FinanceOpsModule'],
    routes: ['finance-ops'],
    requires: ['finance'],
  },
  {
    key: 'finance-report',
    label: 'Moliya hisoboti',
    tier: 'leaf',
    nestModules: ['FinanceReportModule'],
    routes: ['finance-report'],
  },
  {
    key: 'grades',
    label: 'Baholash va reyting',
    tier: 'leaf',
    nestModules: ['GradesModule'],
    routes: ['grades'],
    requires: ['attendance', 'coin'],
  },
  {
    key: 'groups',
    label: 'Guruhlar',
    tier: 'load-bearing',
    core: true,
    nestModules: ['GroupsModule'],
    routes: ['groups'],
    requires: ['expense-approvals', 'system-notifications'],
  },
  {
    key: 'holidays',
    label: 'Bayramlar',
    tier: 'load-bearing',
    nestModules: ['HolidaysModule'],
    routes: ['holidays'],
    requires: ['notifications'],
  },
  {
    key: 'imports',
    label: 'Excel import',
    tier: 'leaf',
    nestModules: ['ImportsModule'],
    routes: ['imports'],
    requires: ['finance', 'groups', 'opening-balance', 'staff-payroll', 'users'],
  },
  {
    key: 'journal',
    label: 'Kassa jurnali',
    tier: 'near-leaf',
    core: true,
    nestModules: ['JournalModule'],
    routes: ['journal'],
  },
  {
    key: 'lead-options',
    label: 'Lid kataloglari',
    tier: 'leaf',
    nestModules: ['LeadOptionsModule'],
    routes: ['lead-options'],
  },
  {
    key: 'leads',
    label: 'Lidlar (CRM)',
    tier: 'leaf',
    nestModules: ['LeadsModule'],
    routes: ['leads'],
    requires: ['groups', 'notifications'],
  },
  {
    key: 'ledger',
    label: 'Shaxsiy moliyaviy tarix',
    tier: 'leaf',
    nestModules: ['LedgerModule'],
    routes: ['ledger'],
    requires: ['opening-balance'],
  },
  {
    key: 'lesson-cancellations',
    label: 'Dars bekor qilish',
    tier: 'leaf',
    nestModules: ['LessonCancellationsModule'],
    routes: ['lesson-cancellations'],
    requires: ['finance'],
  },
  {
    key: 'market',
    label: 'Market (tanga do\'koni)',
    tier: 'leaf',
    nestModules: ['MarketModule'],
    routes: ['market'],
    requires: ['coin', 'notifications'],
  },
  {
    key: 'notification-templates',
    label: 'Bildirishnoma shablonlari',
    tier: 'leaf',
    nestModules: ['NotificationTemplatesModule'],
    routes: ['notification-templates'],
  },
  {
    key: 'notifications',
    label: 'Bildirishnomalar',
    tier: 'load-bearing',
    nestModules: ['NotificationsModule'],
    routes: ['notifications'],
  },
  {
    key: 'opening-balance',
    label: 'Boshlang\'ich qoldiq',
    tier: 'load-bearing',
    nestModules: ['OpeningBalanceModule'],
    routes: ['opening-balance'],
    requires: ['finance'],
  },
  {
    key: 'platform-analytics',
    label: 'Platforma analitikasi',
    tier: 'leaf',
    core: true,
    locked: true,
    nestModules: ['PlatformAnalyticsModule'],
    routes: ['internal/analytics'],
  },
  {
    key: 'roles',
    label: 'Rollar va ruxsatlar',
    tier: 'leaf',
    core: true,
    nestModules: ['RolesModule'],
    routes: ['roles'],
  },
  {
    key: 'rooms',
    label: 'Xonalar',
    tier: 'leaf',
    nestModules: ['RoomsModule'],
    routes: ['rooms'],
  },
  {
    key: 'search',
    label: 'Global qidiruv (⌘K)',
    tier: 'leaf',
    nestModules: ['SearchModule'],
    routes: ['search'],
  },
  {
    key: 'staff-payroll',
    label: 'Xodim maoshi va KPI',
    tier: 'near-leaf',
    nestModules: ['StaffPayrollModule'],
    routes: ['staff-payroll'],
    requires: ['expense-approvals', 'finance'],
  },
  {
    key: 'storage',
    label: 'Fayl saqlagich',
    tier: 'near-leaf',
    nestModules: ['StorageModule'],
    routes: ['storage'],
  },
  {
    key: 'student-freeze',
    label: 'O\'quvchini muzlatish',
    tier: 'load-bearing',
    nestModules: ['StudentFreezeModule'],
    routes: ['student-freezes'],
  },
  {
    key: 'system-notifications',
    label: 'Tizim bildirishnomalari',
    tier: 'near-leaf',
    nestModules: ['SystemNotificationsModule'],
    routes: ['system-notifications'],
  },
  {
    key: 'teacher-attendance',
    label: 'O\'qituvchi davomati',
    tier: 'leaf',
    nestModules: ['TeacherAttendanceModule'],
    routes: ['teacher-attendance'],
    requires: ['attendance'],
  },
  {
    key: 'users',
    label: 'Foydalanuvchilar',
    tier: 'near-leaf',
    core: true,
    nestModules: ['UsersModule'],
    routes: ['users'],
    requires: ['archive-reasons', 'expense-approvals', 'finance', 'opening-balance', 'staff-payroll', 'student-freeze', 'system-notifications'],
  },
  // ── IMKONIYATLAR (capability) — modul ostidagi alohida sotiladigan qism ──
  //
  // ⚠ QO'LDA YOZILADI, generatsiya qilinmaydi: bu MAHSULOT qarori
  // (nimani alohida sotamiz), kod grafigining natijasi emas.
  {
    key: 'imports.finance',
    parent: 'imports',
    label: "Excel import — to'lov va maosh",
    tier: 'leaf',
  },
]);

/** Kalit bo'yicha tez qidirish. */
export const FEATURE_BY_KEY: ReadonlyMap<string, FeatureDef> = new Map(
  FEATURES.map((f) => [f.key, f]),
);

/**
 * Panelda o'chirgich ko'rsatiladigan kalitlar.
 *
 * ⚠ Shart `!f.locked`, ilgarigidek `!f.core` EMAS: `core` endi
 * "xavfli, tasdiq so'raladi" degani, "o'chirib bo'lmaydi" emas.
 */
export const SWITCHABLE_KEYS: readonly string[] = Object.freeze(
  FEATURES.filter((f) => !f.locked).map((f) => f.key),
);

/** Barcha kalitlar — migratsiya va sinxronlash uchun. */
export const ALL_FEATURE_KEYS: readonly string[] = Object.freeze(
  FEATURES.map((f) => f.key),
);

/**
 * Marshrut prefiksi → tarif kaliti.
 *
 * ⚠ GLOBAL DARVOZA SHUNDAN ISHLAYDI, har modulga alohida middleware
 * ulanmaydi. Sabab: 49 ta faylga qo'lda ulanish — bittasini unutish
 * paywall'ni jimgina teshib qo'yishning eng oson yo'li. Markazlashgan
 * xarita esa unutilishi MUMKIN EMAS va `feature-graph` testi har bir
 * prefiks haqiqiy kontrollerga tegishli ekanini tekshiradi.
 *
 * ⚠ CHIQARIB TASHLANADIGANLAR `locked`, ilgarigidek `core` EMAS.
 * `core` modullar endi haqiqatan 402 qaytaradi — busiz "panelda
 * o'chirdim, lekin bo'lim baribir ishlayapti" holati bo'lardi.
 *
 * `locked` ('auth', 'features') hech qachon darvozaga tushmaydi.
 * `global-feature-gate.ts` shu qarorni `NEVER_GATED` ro'yxati bilan
 * TAKRORLAYDI — ataylab: reyestr generatsiya qilinadi, ro'yxat esa
 * qo'lda va o'zgarmas, ya'ni generator xatosi tenantni qulflab
 * qo'ymaydi.
 */
export const ROUTE_TO_FEATURE: ReadonlyMap<string, string> = new Map(
  FEATURES.flatMap((f) =>
    (f.locked || f.gatedElsewhere ? [] : f.routes ?? []).map((r) => [r, f.key] as const),
  ),
);

/**
 * So'rov yo'lidan tarif kalitini topadi.
 *
 * ⚠ FAQAT BIRINCHI SEGMENT. `/imports/students/preview` → `imports`.
 * Chuqurroq moslash `internal/entitlements` kabi ikki bo'lakli
 * prefikslarni buzardi, shuning uchun ikki bo'lakli variant ham
 * sinaladi — lekin FAQAT xaritada bo'lsa.
 */
export const featureForPath = (path: string): string | undefined => {
  const parts = path.replace(/^\/+/, '').split('/');
  return (
    ROUTE_TO_FEATURE.get(`${parts[0]}/${parts[1]}`) ??
    ROUTE_TO_FEATURE.get(parts[0] ?? '')
  );
};

/** Ota zanjiri: `imports.finance` → `['imports.finance', 'imports']`. */
export const featureChain = (key: string): string[] => {
  const chain: string[] = [];
  let cursor: string | undefined = key;
  while (cursor && chain.length <= FEATURES.length) {
    chain.push(cursor);
    cursor = FEATURE_BY_KEY.get(cursor)?.parent;
  }
  return chain;
};

/**
 * `key` ni o'chirish TO'SILADIMI — uni `requires` da ushlab turgan,
 * hozir OCHIQ bo'lgan kalitlar.
 *
 * To'siq KONFIGURATSIYA paytida, odam o'qiy oladigan joyda chiqadi —
 * mijozning maosh hisobida emas.
 */
export const blockersForDisabling = (
  key: string,
  isEnabled: (k: string) => boolean,
): string[] =>
  FEATURES.filter(
    (f) => f.key !== key && f.requires?.includes(key) && isEnabled(f.key),
  ).map((f) => f.key);
