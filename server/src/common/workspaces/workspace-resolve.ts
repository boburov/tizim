/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ISH MAKONI — SERVER TOMONIDAGI QAROR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ NEGA SERVERDA HAM ──
 *
 * Bu qaror ilgari FAQAT klientda edi
 * (`client/src/shared/workspaces/workspaces.js`). Qoida uchta kirishga
 * bog'liq: rol tipi, ruxsatlar va filialli tarif. Uchtasi ham serverdan
 * keladi, ya'ni qaror ham shu yerda hisoblanishi mumkin — va bu ikki
 * tomonning JIMGINA AJRALIB KETISHINI oldini oladi.
 *
 * Ajralish qanday ko'rinardi: klientda ega `/org` ga tushadi, keyingi
 * relizda serverda filialli tarif shartini o'zgartiramiz, klient esa eski
 * hisobda qoladi — natijada ega `/org` ga tushadi-yu, uning har bir
 * so'rovi filial ko'lami bilan chegaralanadi. Bo'sh ekran, xatosiz.
 *
 * ── ⚠ BU XAVFSIZLIK EMAS ──
 *
 * `/owner` va `/org` — KLIENT marshrutlari. Serverda ular uchun alohida
 * API yuzasi YO'Q: ikkala panel ham bir xil `/students`, `/finance`,
 * `/branches` ni chaqiradi. Ya'ni "egani `/owner` dan server bloklasin"
 * degan gap bajarilmaydi — bloklanadigan endpoint mavjud emas.
 *
 * Bu funksiya faqat QAROR MANBAINI birlashtiradi. Ma'lumot himoyasi
 * o'z joyida qoladi: `auth.middleware.ts` (rol + ruxsat + filial ko'lami)
 * va `plan-limits.service.ts` (tarif chegaralari).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const WORKSPACES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  STAFF: 'staff',
  STUDENT: 'student',
} as const;

export type Workspace = (typeof WORKSPACES)[keyof typeof WORKSPACES];

/** Klientdagi `WORKSPACE_META[...].home` bilan AYNAN bir xil bo'lishi shart. */
const HOME: Record<Workspace, string> = {
  [WORKSPACES.SUPER_ADMIN]: '/org',
  [WORKSPACES.ADMIN]: '/owner/dashboard',
  [WORKSPACES.STAFF]: '/work',
  [WORKSPACES.STUDENT]: '/me',
};

export interface WorkspaceInput {
  /** `roleMeta.roleType` — owner | staff | teacher | student. */
  roleType: string | null | undefined;
  /** Amaldagi rolning ruxsat kalitlari. */
  permissions: string[];
  /** Filialli tarif yoqilganmi (`branchLimits.branchesEnabled`). */
  branchesEnabled: boolean;
}

export interface WorkspaceResult {
  workspace: Workspace;
  home: string;
}

const hasKey = (permissions: string[], key: string): boolean =>
  permissions.includes('*') || permissions.includes(key);

/**
 * Tashkilot darajasidagi vakolat — ikkala kalit ham shart.
 *
 * Faqat `branches.view_all` bo'lgan odam konsolidatsiya hisobotini
 * o'qiydigan buxgalter, tashkilot boshqaruvchisi emas.
 */
export const hasOrgAuthority = (permissions: string[]): boolean =>
  hasKey(permissions, 'branches.view_all') &&
  hasKey(permissions, 'system.admin_access');

export const resolveWorkspace = (input: WorkspaceInput): WorkspaceResult => {
  const { roleType, permissions, branchesEnabled } = input;

  const pick = (workspace: Workspace): WorkspaceResult => ({
    workspace,
    home: HOME[workspace],
  });

  if (roleType === 'student') return pick(WORKSPACES.STUDENT);

  // O'qituvchi — HAR DOIM xodim makoni, qancha ruxsat berilsa ham.
  if (roleType === 'teacher') return pick(WORKSPACES.STAFF);

  // ── EGA: FILIALLI TARIFDA `/org`, FILIALSIZDA `/owner` ──
  //
  // Filialsiz tenantda `/org` UMUMAN YO'Q: u bitta filialning
  // ma'lumotini ikkinchi marta, boshqa menyu bilan ko'rsatardi.
  if (roleType === 'owner') {
    return pick(branchesEnabled ? WORKSPACES.SUPER_ADMIN : WORKSPACES.ADMIN);
  }

  // ⚠ EGADAN BOSHQA HAMMA `/owner` DA — tashkilot vakolati bo'lsa ham.
  // `/org` eganing MAKONI, lavozim darajasi emas.
  if (hasOrgAuthority(permissions)) return pick(WORKSPACES.ADMIN);
  if (hasKey(permissions, 'admin_dashboard.read')) return pick(WORKSPACES.ADMIN);

  return pick(WORKSPACES.STAFF);
};
