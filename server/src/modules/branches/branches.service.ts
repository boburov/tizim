import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { validateDelegation } from '../../common/constants/delegation.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { hashPassword } from '../../common/utils/password.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import {
  CredentialScopeService,
  canReadCredentialsIn,
  type CredentialActor,
} from '../../common/rbac/credential-scope.js';
import { RolesHelperService } from '../../common/rbac/roles.helper.js';
import { PlanLimitsService } from '../../common/entitlements/plan-limits.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIALLAR — `server/src/modules/branches/services/branches.service.js`
 * NING KO'CHIRMASI (8/8 marshrut).
 *
 * ── ⚠ YAGONA YOZUVCHI KELISHUVI SHU MODULGA HAM TEGISHLI ──
 *
 * `BranchAccessService` "markaz ko'p filiallimi" javobini JARAYONGA XOS
 * keshda saqlaydi va `clearMainBranchCache()` faqat O'Z jarayonini
 * tozalaydi — bu ROL KESHI bilan AYNAN bir xil vaziyat.
 *
 * Express va NestJS bir vaqtda YOZSA, birida ochilgan filial
 * ikkinchisining keshini invalidatsiya QILMASDI va u jarayon o'zini
 * hamon yakka markaz deb hisoblab turardi: `/auth/me` `multiBranch:false`
 * berardi, yakka rejim esa hamma narsani ASOSIY filialga qisardi — ya'ni
 * yangi filial JIMGINA muzlab qolardi.
 *
 * SHUNING UCHUN: bu metodlar KODDA bor va testlanadi, lekin HAQIQIY
 * TRAFIK to'liq cutover'gacha Express'da qoladi. Cutover'dan keyin
 * NestJS yagona jarayon bo'ladi va kesh o'z-o'zicha izchil bo'lib qoladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Foydalanuvchi filialga IKKI yo'l bilan bog'lanadi: `homeBranchId` yoki
 * `branchAssignments`. Bittasini unutish odamni "begona" qilib ko'rsatardi.
 */
const userInBranch = (branchId: string) => ({
  OR: [
    { homeBranchId: String(branchId) },
    { branchAssignments: { some: { branchId: String(branchId) } } },
  ],
});

const userInBranches = (ids: string[]) => ({
  OR: [
    { homeBranchId: { in: ids } },
    { branchAssignments: { some: { branchId: { in: ids } } } },
  ],
});

@Injectable()
export class BranchesService {
  private readonly logger = new Logger('Branches');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly credentials: CredentialScopeService,
    private readonly roles: RolesHelperService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * FILIALLAR RO'YXATI.
   *
   * ⚠ `branchFilter()` BU YERDA ISHLATILMAYDI — foydalanuvchi qaysi
   * filiallarga kira olishini `allowedBranchIds` hal qiladi (u auth
   * bosqichida hisoblangan). Filial ro'yxati — ko'lamning O'ZI, uni yana
   * o'ziga filtrlab bo'lmaydi.
   */
  async list({
    search,
    includeInactive = false,
    allowedBranchIds = [],
    canSeeAllBranches = false,
    /**
     * BOSHQARUVCHI LOGINI — IXTIYORIY VA RUXSAT BILAN.
     *
     * Bu ro'yxat filial tanlagichi uchun HAR QANDAY auth'langan
     * foydalanuvchiga ochiq (o'quvchi ham o'z filialini ko'radi).
     * Shuning uchun xodim logini standart holatda QAYTMAYDI — uni
     * faqat kontroller `users.read` ruxsatini tekshirgandan keyin
     * so'raydi. Aks holda o'quvchi filial tanlagichini ochib
     * direktorning loginini o'qib olardi.
     */
    withManagers = false,
    /**
     * PAROL — ALOHIDA VA ENG QATTIQ CHEGARA.
     *
     * ⚠ `branches.view_all` bu yerda o'tkazgich EMAS — aks holda
     * "hisobot ruxsati" butun tarmoqning parollarini ochib berardi.
     * Qoida `users.getPassword` bilan AYNI va bitta joydan keladi.
     */
    credentials = null,
    page = 1,
    limit = 100,
  }: {
    search?: string;
    includeInactive?: boolean;
    allowedBranchIds?: string[];
    canSeeAllBranches?: boolean;
    withManagers?: boolean;
    credentials?: CredentialActor | null;
    page?: number;
    limit?: number;
  }) {
    const where: any = { isDeleted: false };
    if (!includeInactive) where.isActive = true;
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }
    // `view_all` yo'q bo'lsa — faqat biriktirilgan filiallar.
    if (!canSeeAllBranches) {
      where.id = { in: allowedBranchIds.map(String) };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.branch.count({ where }),
    ]);

    // N+1 DAN QOCHISH: har filial uchun alohida so'rov o'rniga BITTA
    // so'rov va xotirada guruhlash.
    let managersByBranch = new Map<string, unknown[]>();
    if (withManagers && items.length) {
      const ids = items.map((b) => String(b.id));

      // Parol so'ralgan bo'lsa — aktyorning HAQIQIY ko'lami.
      const actorBranchIds = credentials
        ? await this.credentials.actorBranchIds(credentials.actorId)
        : [];
      const users = await this.prisma.user.findMany({
        where: {
          ...userInBranches(ids),
          role: { notIn: ['student', 'teacher', 'owner'] },
          isActive: true,
          isDeleted: false,
        },
        select: {
          id: true,
          username: true,
          role: true,
          firstName: true,
          lastName: true,
          homeBranchId: true,
          branchAssignments: { select: { branchId: true } },
          // ⚠ Global `omit` parolni HAR QANDAY so'rovdan chetlatadi;
          // uni OCHIQ `select` bekor qiladi.
          //
          // `omit: { passwordHash: false }` ISHLATILMAYDI: Prisma
          // `select` va `omit` ni BIR VAQTDA qabul qilmaydi.
          ...(credentials ? { passwordHash: true } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });

      managersByBranch = users.reduce((acc, u: any) => {
        // Bir odam bir necha filialga biriktirilgan bo'lishi mumkin —
        // u HAR BIRIDA ko'rinishi kerak.
        const branchIds = new Set<string>([
          ...(u.homeBranchId ? [String(u.homeBranchId)] : []),
          ...u.branchAssignments.map((a: any) => String(a.branchId)),
        ]);
        for (const bid of branchIds) {
          if (!ids.includes(bid)) continue;
          if (!acc.has(bid)) acc.set(bid, []);

          // ⚠ PAROL FILIAL BO'YICHA QARORLASHTIRILADI, odam bo'yicha
          // emas: bir xodim bir necha filialga biriktirilgan bo'lishi
          // mumkin va aktyor ularning faqat bir qismini ko'rishi mumkin.
          const showPassword =
            credentials &&
            canReadCredentialsIn(actorBranchIds, credentials.isOwner, bid);

          acc.get(bid)!.push({
            id: u.id,
            username: u.username,
            role: u.role,
            firstName: u.firstName,
            lastName: u.lastName,
            ...(showPassword ? { password: u.passwordHash || '' } : {}),
          });
        }
        return acc;
      }, new Map<string, unknown[]>());
    }

    const shaped = withLegacyIds(items).map((b: any) =>
      withManagers ? { ...b, managers: managersByBranch.get(String(b.id)) || [] } : b,
    );

    return { items: shaped, total, page, limit };
  }

  /**
   * ⚠ KO'LAM IXTIYORIY EMAS, SO'ROVDAN KELADI — `stats()` bilan bir xil.
   *
   * FILIAL: bitta filial yozuvida `delegation` va
   * `expenseApprovalThreshold` bor, ya'ni BOSHQA filialning ichki
   * boshqaruv qoidalari. HTTP yo'li (`GET /branches/:id`) endi ko'lamni
   * uzatadi; uzatilmagan ICHKI chaqiruvlar (`update`, `softRemove`,
   * `stats`) o'z qo'riqchisiga ega va bu yerda ikkinchi marta
   * tekshirilmaydi.
   */
  async getById(
    id: string,
    scope?: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean },
  ) {
    const doc = await this.prisma.branch.findFirst({ where: { id, isDeleted: false } });
    if (!doc) throw new ApiError(404, 'Filial topilmadi');

    if (scope && !scope.canSeeAllBranches) {
      const allowed = (scope.allowedBranchIds || []).some(
        (b) => String(b) === String(doc.id),
      );
      if (!allowed) throw new ApiError(403, "Bu filialga ruxsatingiz yo'q");
    }

    return withLegacyId(doc);
  }

  async create(body: {
    name: string;
    code?: string | null;
    address?: string | null;
    phone?: string | null;
  }) {
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError(400, 'Filial nomi kerak');

    // ═════════════════════════════════════════════════════════════════
    // ⚠ TARIF CHEGARASI — SERVER TOMONIDA, NOM TEKSHIRUVIDAN OLDIN.
    //
    // Tartib ataylab shunday: chegara tugagan bo'lsa mijoz "bu nom band"
    // degan xabarni umuman ko'rmasligi kerak — javob bitta va aniq
    // bo'lsin (`BRANCH_LIMIT_REACHED`), aks holda u nomni o'zgartirib
    // qayta-qayta urinardi.
    //
    // ⚠ FRONTENDGA TAYANMAYDI. Klientdagi tekshiruv faqat qulaylik;
    // `POST /branches` ga to'g'ridan-to'g'ri murojaat ham SHU YERDA
    // to'siladi.
    //
    // ⚠ `createWithDirector` ham shu metodga tushadi — ya'ni direktor
    // bilan birga ochish yo'li ham himoyalangan. Ikkinchi tekshiruv
    // qo'shilmaydi: bitta darvoza, bitta joyda.
    // ═════════════════════════════════════════════════════════════════
    await this.planLimits.assertBranchLimit();

    const exists = await this.prisma.branch.findFirst({ where: { name, isDeleted: false } });
    if (exists) throw new ApiError(409, 'Bunday nomli filial allaqachon mavjud');

    // Birinchi filial avtomatik ASOSIY bo'ladi.
    const count = await this.prisma.branch.count({ where: { isDeleted: false } });

    const doc = await this.prisma.branch.create({
      data: {
        name,
        code: body.code ? String(body.code).trim().toUpperCase() : null,
        address: body.address ? String(body.address).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        isMain: count === 0,
      },
    });

    // ═════════════════════════════════════════════════════════════════
    // ⚠ KESHNI TOZALASH — SHARTSIZ.
    //
    // `BranchAccessService` FAOL filiallar sonini keshlaydi va "markaz
    // ko'p filiallimi" degan savolga shu keshdan javob beradi. Kesh
    // tozalanmasa IKKINCHI FILIAL OCHILGANDAN KEYIN HAM tizim o'zini
    // yakka markaz deb hisoblab turaverardi:
    //   • `/auth/me` `multiBranch: false` qaytarardi → filial tanlagichi
    //     ham, filiallararo bo'limlar ham CHIQMASDI;
    //   • yakka rejim hamma narsani ASOSIY filialga qisadi, ya'ni yangi
    //     filialning ma'lumoti na o'qilardi, na yozilardi — u JIMGINA
    //     muzlab qolardi;
    //   • holat server qayta ishga tushgunga qadar davom etardi.
    // ═════════════════════════════════════════════════════════════════
    this.branchAccess.clearMainBranchCache();

    return withLegacyId(doc);
  }

  /**
   * FILIAL + DIREKTORNI BIRGA yaratadi.
   *
   * ⚠ ATOMIKLIK: bu yerda ko'p-jadvalli tranzaksiya ISHLATILMAYDI —
   * Express'dagi bilan aynan bir xil naqsh saqlanadi:
   *   (1) OLDINDAN validatsiya — eng ko'p uchraydigan xato (login band)
   *       filial yaratilgunga QADAR tutiladi;
   *   (2) xato bo'lsa KOMPENSATSIYA — filial o'chiriladi.
   *
   * Buni `$transaction` ga aylantirish vasvasasiga berilmang: `create()`
   * ichida kesh tozalash yon ta'siri bor va u qaytarilmaydi.
   */
  async createWithDirector(
    body: any,
    currentUser: { _id?: unknown; permissions?: string[] },
  ) {
    const { director, ...branchBody } = body;

    // DIREKTORSIZ: faqat filial ochiladi.
    if (!director) return this.create(branchBody);

    // ── 1-QADAM: OLDINDAN validatsiya (hech narsa yaratilmasdan) ──
    const username = String(director.username || '').toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { username } })) {
      throw new ApiError(409, 'Bunday login (username) allaqachon mavjud');
    }
    const dirPhone = director.phone ? normalizePhone(director.phone) : null;
    if (director.phone && !dirPhone) {
      throw new ApiError(400, "Direktor telefon raqami noto'g'ri");
    }
    // Telefon bandligi TEKSHIRILMAYDI — takrorlanish ruxsat etilgan.

    const roleValue = director.role || 'director';
    const targetRole = await this.roles.assertRoleAssignable(roleValue);
    await this.roles.assertCanGrantRole(targetRole, currentUser as never);

    // ── 2-QADAM: filial ──
    const branch: any = await this.create(branchBody);

    // ⚠ ISM IXTIYORIY — TEZKOR FILIAL OCHISH UCHUN.
    //
    // Bo'sh qolgan ism O'RNI TO'LDIRILADI, lekin JIMGINA emas: qiymat
    // o'qilganda darhol "bu to'ldirilmagan" deb tushuniladi —
    // "Direktor <filial nomi>". Tasodifiy identifikator yoki bo'sh joy
    // qo'yilsa, aksincha, ma'lumot to'liqdek ko'rinardi.
    const firstName = String(director.firstName || '').trim() || 'Direktor';
    const lastName =
      String(director.lastName || '').trim() || String(branchBody.name).trim();

    // ── 3-QADAM: direktor (xato bo'lsa filialni qaytarib olamiz) ──
    try {
      const passwordHash = await hashPassword(director.password);
      const user = await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          username,
          phone: dirPhone || null,
          passwordHash,
          role: roleValue,
          homeBranchId: branch.id,
          isActive: true,
          hiredAt: new Date(),
        },
      });

      return {
        branch,
        director: { _id: user.id, id: user.id, username: user.username },
      };
    } catch (err) {
      // KOMPENSATSIYA: direktorsiz filial qolmasin. Bu yerda HARD
      // delete — filial hozirgina yaratilgan, ichida ma'lumot yo'q.
      await this.prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
      this.logger.warn(
        `Direktor yaratilmadi — filial qaytarib olindi (branchId=${branch.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  async update(id: string, body: any) {
    const doc: any = await this.getById(id);
    const data: any = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError(400, 'Filial nomi kerak');
      const clash = await this.prisma.branch.findFirst({
        where: { name, isDeleted: false, id: { not: doc.id } },
      });
      if (clash) throw new ApiError(409, 'Bunday nomli filial allaqachon mavjud');
      data.name = name;
    }

    if (body.code !== undefined) {
      data.code = body.code ? String(body.code).trim().toUpperCase() : null;
    }
    if (body.address !== undefined) {
      data.address = body.address ? String(body.address).trim() : null;
    }
    if (body.phone !== undefined) {
      data.phone = body.phone ? String(body.phone).trim() : null;
    }

    // ── DELEGATSIYA MATRITSASI ──
    //
    // ⚠ TO'LIQ ALMASHTIRISH (qisman birlashtirish EMAS): owner matritsani
    // yaxlit forma sifatida ko'radi va saqlaydi. Birlashtirish bo'lsa,
    // formadan olib tashlangan qoida bazada qolib ketardi — ya'ni owner
    // "o'chirdim" deb o'ylagan ishonch amalda kuchda qolardi.
    if (body.delegation !== undefined) {
      if (body.delegation === null) {
        // Prisma'da Json ustunni tozalash — `Prisma.DbNull` emas, oddiy
        // `null` (ustun nullable).
        data.delegation = null;
      } else {
        const error = validateDelegation(body.delegation);
        if (error) throw new ApiError(400, error);
        data.delegation = body.delegation;
      }
    }

    // CHIQIM LIMITI: null yoki 0 = cheksiz.
    if (body.expenseApprovalThreshold !== undefined) {
      const v = body.expenseApprovalThreshold;
      if (v === null || v === '' || Number(v) <= 0) {
        data.expenseApprovalThreshold = null;
      } else {
        data.expenseApprovalThreshold = Number(v);
      }
    }

    if (body.isActive !== undefined) {
      const nextActive = Boolean(body.isActive);
      // ASOSIY filialni o'chirib bo'lmaydi — migratsiyada barcha eski
      // ma'lumot shunga biriktirilgan, u yo'qolsa ko'lam buziladi.
      if (!nextActive && doc.isMain) {
        throw new ApiError(400, "Asosiy filialni nofaol qilib bo'lmaydi");
      }
      data.isActive = nextActive;
      data.archivedAt = nextActive ? null : new Date();
    }

    const updated = await this.prisma.branch.update({ where: { id: doc.id }, data });

    // FAOLLIK O'ZGARSA rejim ham o'zgarishi mumkin. Kesh FAQAT shu
    // holatda tozalanadi — nom yoki manzil tahriri rejimga ta'sir qilmaydi.
    if (data.isActive !== undefined) this.branchAccess.clearMainBranchCache();

    return withLegacyId(updated);
  }

  /**
   * Filialni o'chirish (soft delete).
   *
   * Ichida ma'lumot bo'lsa — BLOKLANADI, aks holda guruh/foydalanuvchi
   * "yetim" qolib, hech kim ko'ra olmaydigan holatga tushardi.
   */
  async softRemove(id: string, currentUser: { id?: unknown; _id?: unknown } | undefined) {
    const doc: any = await this.getById(id);

    if (doc.isMain) throw new ApiError(400, "Asosiy filialni o'chirib bo'lmaydi");

    // ⚠ TO'SIQ FAQAT HAQIQIY MA'LUMOT UCHUN: guruhlar, o'quvchilar va
    // o'qituvchilar.
    //
    // XODIM (direktor/administrator) ATAYLAB HISOBGA OLINMAYDI. Ilgari u
    // ham to'sardi va HALQA hosil bo'lardi: filial yaratilganda tizim
    // O'ZI direktor yaratardi, keyin o'sha direktor filialni o'chirishga
    // to'sqinlik qilardi. Endi xodim filial bilan birga arxivlanadi.
    const [groupCount, members, staff] = await Promise.all([
      this.prisma.group.count({ where: { branchId: doc.id, isDeleted: false } }),
      // SANAB emas, RO'YXAT bilan: to'siq xabari KIMNI ko'chirish
      // kerakligini aytishi kerak. Ilgari faqat son berilardi va
      // arxivlangan o'qituvchi kartada ko'rinmagani uchun ega nimani
      // ko'chirishni bilmay qolardi — o'chirib bo'lmaydigan filial.
      this.prisma.user.findMany({
        where: {
          ...userInBranch(doc.id),
          role: { in: [ROLES.STUDENT, ROLES.TEACHER] },
          isDeleted: false,
        },
        select: { firstName: true, lastName: true, role: true, isActive: true },
        take: 10,
      }),
      this.prisma.user.findMany({
        where: {
          ...userInBranch(doc.id),
          role: { notIn: [ROLES.STUDENT, ROLES.TEACHER, ROLES.OWNER] },
          isDeleted: false,
        },
        select: {
          id: true,
          homeBranchId: true,
          branchAssignments: { select: { branchId: true } },
        },
      }),
    ]);

    if (groupCount > 0 || members.length > 0) {
      const who = members
        .map(
          (u) =>
            `${u.firstName} ${u.lastName}` + (u.isActive === false ? ' (arxivda)' : ''),
        )
        .join(', ');

      const parts: string[] = [];
      if (groupCount > 0) parts.push(`${groupCount} ta guruh`);
      if (members.length > 0) parts.push(`${members.length} ta o'quvchi/o'qituvchi`);

      throw new ApiError(
        400,
        `Filialda ${parts.join(' va ')} bor. Avval ularni boshqa filialga ko'chiring.` +
          // "(arxivda)" belgisi MUHIM: arxivlangan odam ro'yxatlarda
          // ko'rinmaydi, lekin baribir to'sadi.
          (who ? ` Kimlar: ${who}` : ''),
      );
    }

    // BOSHQA FILIALDA HAM ISHLAYDIGAN xodimni arxivlamaymiz — undan shu
    // filial biriktiruvini olib tashlash yetarli.
    const solelyHere: string[] = [];
    const alsoElsewhere: string[] = [];
    for (const u of staff) {
      const others = (u.branchAssignments || []).filter(
        (a) => a?.branchId && String(a.branchId) !== String(doc.id),
      );
      const homeElsewhere = u.homeBranchId && String(u.homeBranchId) !== String(doc.id);
      (others.length || homeElsewhere ? alsoElsewhere : solelyHere).push(u.id);
    }

    if (solelyHere.length) {
      await this.prisma.user.updateMany({
        where: { id: { in: solelyHere } },
        data: { isActive: false, archivedAt: new Date() },
      });
    }
    if (alsoElsewhere.length) {
      await this.prisma.userBranchAssignment.deleteMany({
        where: { userId: { in: alsoElsewhere }, branchId: doc.id },
      });
    }

    const removed = await this.prisma.branch.update({
      where: { id: doc.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: (currentUser?.id || currentUser?._id || null) as never,
      },
    });

    // Filial ro'yxatdan chiqdi — "ko'p filialli" javobi o'zgarishi mumkin.
    this.branchAccess.clearMainBranchCache();

    return withLegacyId(removed);
  }

  /** Filial statistikasi — kartochkada ko'rsatish uchun. */
  async stats(
    id: string,
    {
      allowedBranchIds = [],
      canSeeAllBranches = false,
    }: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } = {},
  ) {
    const doc: any = await this.getById(id);
    const branchId = doc.id;

    // ⚠ KO'LAM TEKSHIRUVI. Bu endpoint filial RAHBARIYATINING ism va
    // loginini ham qaytaradi, ya'ni "o'z filialingdan boshqasini o'qima"
    // qoidasi shart.
    if (!canSeeAllBranches) {
      const allowed = allowedBranchIds.some((b) => String(b) === String(branchId));
      if (!allowed) throw new ApiError(403, "Bu filialga ruxsatingiz yo'q");
    }

    const [groupCount, activeGroupCount, staffCount, studentCount, managers] =
      await Promise.all([
        this.prisma.group.count({ where: { branchId, isDeleted: false } }),
        this.prisma.group.count({
          where: { branchId, isActive: true, isDeleted: false },
        }),
        this.prisma.user.count({
          where: {
            ...userInBranch(branchId),
            role: { notIn: ['student'] },
            isActive: true,
            isDeleted: false,
          },
        }),
        this.prisma.user.count({
          where: {
            ...userInBranch(branchId),
            role: 'student',
            isActive: true,
            isDeleted: false,
          },
        }),
        // FILIAL RAHBARIYATI.
        //
        // ⚠ PAROL BU YERDA QAYTARILMAYDI: uni alohida
        // `/users/:id/password` beradi, ya'ni ro'yxat so'ralganda
        // parollar yopiq qoladi.
        this.prisma.user.findMany({
          where: {
            ...userInBranch(branchId),
            role: { notIn: ['student', 'teacher', 'owner'] },
            isActive: true,
            isDeleted: false,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            role: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 5,
        }),
      ]);

    return {
      groupCount,
      activeGroupCount,
      staffCount,
      studentCount,
      managers: withLegacyIds(managers),
    };
  }

  /**
   * TAQQOSLASH — barcha ko'rinadigan filiallar bitta jadvalda.
   *
   * N+1 dan qochish: har filial uchun alohida `stats(id)` chaqirilsa 4×N
   * so'rov bo'lardi. Bu yerda har bir o'lcham uchun BITTA so'rov.
   */
  async compare({
    allowedBranchIds = [],
    canSeeAllBranches = false,
  }: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean }) {
    const where: any = { isDeleted: false, isActive: true };
    if (!canSeeAllBranches) where.id = { in: allowedBranchIds.map(String) };

    const branches = await this.prisma.branch.findMany({
      where,
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        isMain: true,
        expenseApprovalThreshold: true,
      },
    });

    if (!branches.length) return [];

    const ids = branches.map((b) => b.id);

    // Xodim/o'quvchi filialga IKKI yo'l bilan bog'lanadi. Ikkala
    // bog'lanishni birga o'qib, JS'da yig'amiz — aks holda ikki filialga
    // biriktirilgan xodim faqat bittasida hisoblanardi.
    const scopedUsers = await this.prisma.user.findMany({
      where: { isActive: true, isDeleted: false, ...userInBranches(ids) },
      select: {
        role: true,
        homeBranchId: true,
        branchAssignments: { select: { branchId: true } },
      },
    });

    const idSet = new Set(ids.map(String));
    const users: Record<string, { studentCount: number; staffCount: number }> = {};
    for (const u of scopedUsers) {
      // `Set` — bitta odam bir filialda IKKI MARTA sanalmasligi uchun.
      const uBranches = new Set<string>();
      if (u.homeBranchId && idSet.has(String(u.homeBranchId))) {
        uBranches.add(String(u.homeBranchId));
      }
      for (const a of u.branchAssignments) {
        if (idSet.has(String(a.branchId))) uBranches.add(String(a.branchId));
      }
      for (const b of uBranches) {
        if (!users[b]) users[b] = { studentCount: 0, staffCount: 0 };
        if (u.role === 'student') users[b].studentCount += 1;
        else users[b].staffCount += 1;
      }
    }

    // Guruhlar: jami va faol — ikki `groupBy` (Prisma shartli `$sum` bilmaydi).
    const [groupRows, activeGroupRows, pendingRows] = await Promise.all([
      this.prisma.group.groupBy({
        by: ['branchId'],
        where: { branchId: { in: ids }, isDeleted: false },
        _count: { _all: true },
      }),
      this.prisma.group.groupBy({
        by: ['branchId'],
        where: { branchId: { in: ids }, isDeleted: false, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.approval.groupBy({
        by: ['branchId'],
        where: { branchId: { in: ids }, status: 'pending' },
        _count: { _all: true },
      }),
    ]);

    const toMap = (rows: any[]) =>
      rows.reduce((acc: Record<string, number>, r) => {
        acc[String(r.branchId)] = r._count._all;
        return acc;
      }, {});

    const groups = toMap(groupRows);
    const activeGroups = toMap(activeGroupRows);
    const pending = toMap(pendingRows);

    return branches.map((b) => {
      const key = String(b.id);
      return {
        _id: b.id,
        id: b.id,
        name: b.name,
        code: b.code,
        isMain: b.isMain,
        expenseApprovalThreshold: b.expenseApprovalThreshold ?? null,
        studentCount: users[key]?.studentCount || 0,
        staffCount: users[key]?.staffCount || 0,
        groupCount: groups[key] || 0,
        activeGroupCount: activeGroups[key] || 0,
        pendingApprovals: pending[key] || 0,
      };
    });
  }
}
