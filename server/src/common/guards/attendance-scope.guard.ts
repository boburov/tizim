import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../errors/api-error.js';
import { hasPermission } from '../rbac/permission.service.js';
import { PERMISSIONS, ROLE_TYPES } from '../constants/permissions.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMAT / BAHO KO'LAMI — `middleware/attendanceScope.js` NING KO'CHIRMASI.
 *
 * `PermissionsGuard` "shu bo'limga UMUMAN kira oladimi?" degan savolga
 * javob beradi. Bu guard esa IKKINCHI savolga: "AYNAN SHU guruh/o'quvchi
 * uningmi?" — shuning uchun u `PermissionsGuard` DAN KEYIN turadi.
 *
 * ⚠⚠ ROL NOMIGA EMAS, `roleType` GA QARAYDI ⚠⚠
 * REGRESSIYA TARIXI: ilgari bu yerda `req.user.role` uchta built-in
 * satr bilan solishtirilardi (owner/teacher/student). Custom rollar —
 * "Filial direktori", "Bosh o'qituvchi", "Metodist" — HECH QAYSI shoxga
 * tushmay, oxiridagi `403` ga yiqilardi. Natijada matritsada BARCHA
 * ruxsat belgilangan direktor ham davomat sahifasida "Ruxsat etilmagan"
 * olardi: to'siq RUXSATDA emas, ROL NOMIDA edi.
 *
 * ⚠ GUARD `req.scopeGroupIds` NI TO'LDIRADI. Servis qatlami shu ro'yxat
 * bilan cheklaydi. Uni o'rnatishni unutish A-1 "cross-group disclosure"
 * xatosini QAYTARADI: o'qituvchi o'zi o'qitmaydigan guruhlardagi
 * davomatni ham ko'rib qolardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const GROUP_ACCESS_KEY = 'attendance_group_access';
export const STUDENT_ACCESS_KEY = 'attendance_student_access';

/** `requireGroupAccess()` — guruh ID'si qaysi route parametrida. */
export const GroupAccess = (param = 'groupId') =>
  SetMetadata(GROUP_ACCESS_KEY, { param });

/** `requireStudentAccess()` — o'quvchi ID'si qaysi route parametrida. */
export const StudentAccess = (param = 'id') =>
  SetMetadata(STUDENT_ACCESS_KEY, { param });

/**
 * Xodim uchun to'siq RUXSAT emas, FILIAL: u o'z filialining guruhlarini
 * ko'radi. Owner yoki `branches.view_all` — hammasini.
 */
const seesAllBranches = (req: AuthenticatedRequest): boolean =>
  Boolean(req.canSeeAllBranches) ||
  hasPermission(req.permissions, PERMISSIONS.BRANCHES_VIEW_ALL);

const isBranchAllowed = (req: AuthenticatedRequest, branchId: unknown): boolean =>
  (req.allowedBranchIds || []).some((id) => String(id) === String(branchId));

/** Foydalanuvchi (o'quvchi) qaysi filiallarga tegishli. */
const userBranchIds = (doc: {
  homeBranchId?: string | null;
  branchAssignments?: { branchId: string }[];
} | null): Set<string> => {
  const ids = new Set<string>();
  if (doc?.homeBranchId) ids.add(String(doc.homeBranchId));
  for (const a of doc?.branchAssignments || []) {
    if (a?.branchId) ids.add(String(a.branchId));
  }
  return ids;
};

@Injectable()
export class GroupAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Guruhga kirish: owner — barchasi; teacher — faqat O'ZIGA
   * biriktirilgan guruh; xodim (direktor va boshqa custom rollar) —
   * faqat O'Z filiali; student — TAQIQLANGAN.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{ param: string }>(
      GROUP_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

    const roleType = req.role?.roleType;
    if (roleType === ROLE_TYPES.OWNER) return true;
    if (roleType === ROLE_TYPES.STUDENT) throw new ApiError(403, 'Ruxsat etilmagan');

    const groupId = String(
      (req.params as Record<string, unknown>)?.[meta.param] || '',
    );

    if (roleType === ROLE_TYPES.TEACHER) {
      const g = await this.prisma.group.findUnique({
        where: { id: groupId },
        // ⚠ `teachers` — KO'P-KO'PGA bog'lanish. Mongo'da guruh hujjati
        // ichidagi ObjectId massivi edi, Prisma'da alohida jadval.
        select: { teachers: { select: { id: true } } },
      });
      const isOwn =
        g && (g.teachers || []).some((t) => String(t.id) === String(req.user!._id));
      if (isOwn) return true;
      throw new ApiError(403, 'Bu guruh sizga biriktirilmagan');
    }

    // XODIM (staff): direktor, metodist va h.k. Ruxsat matritsasi
    // allaqachon `PermissionsGuard` da tekshirilgan — bu yerda faqat
    // FILIAL chegarasi.
    if (seesAllBranches(req)) return true;

    const g = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { branchId: true },
    });
    // ⚠ Guruh TOPILMASA ham FAIL-CLOSED: mavjud emasligini 403 bilan
    // yashiramiz (ID sanab chiqishga yo'l bermaslik uchun) — 404 EMAS.
    if (g && isBranchAllowed(req, g.branchId)) return true;
    throw new ApiError(403, 'Bu guruh sizning filialingizga tegishli emas');
  }
}

@Injectable()
export class StudentAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * O'quvchiga kirish: owner — barchasi; student — faqat O'ZI;
   * teacher — faqat o'z guruhlaridagi o'quvchi; xodim — faqat o'z
   * filialidagi o'quvchi.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{ param: string }>(
      STUDENT_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

    const sid = String((req.params as Record<string, unknown>)?.[meta.param] || '');

    // ⚠ `scopeGroupIds` HAR SAFAR OCHIQ NULLGA QO'YILADI. So'rov obyekti
    // qayta ishlatilmasa ham, bu "standart holat = cheklovsiz" ekanini
    // ochiq ko'rsatadi va shoxlardan biri uni qo'yishni unutsa,
    // e'tiborsiz qolgan eski qiymat ishlatilib ketmaydi.
    req.scopeGroupIds = null;

    const roleType = req.role?.roleType;
    if (roleType === ROLE_TYPES.OWNER) return true;

    if (roleType === ROLE_TYPES.STUDENT) {
      if (sid && sid === String(req.user._id)) return true;
      throw new ApiError(403, 'Ruxsat etilmagan');
    }

    if (roleType === ROLE_TYPES.TEACHER) {
      const groups = await this.prisma.group.findMany({
        where: { teachers: { some: { id: String(req.user._id) } } },
        select: { id: true },
      });
      const groupIds = groups.map((g) => g.id);
      if (groupIds.length === 0) {
        throw new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas");
      }
      const membership = await this.prisma.groupMembership.findFirst({
        where: { studentId: sid, groupId: { in: groupIds }, isDeleted: false },
        select: { id: true },
      });
      if (membership) {
        // ⚠ A-1 CROSS-GROUP DISCLOSURE TUZATMASI: o'qituvchi shu
        // o'quvchining BOSHQA guruhlardagi davomatini KO'RMASLIGI kerak.
        req.scopeGroupIds = groupIds;
        return true;
      }
      throw new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas");
    }

    // XODIM (staff): o'z filialidagi o'quvchi.
    if (seesAllBranches(req)) return true;

    // ⚠ `branchAssignments` ham ALOHIDA jadval — `select` SHART. Aks
    // holda `userBranchIds` faqat `homeBranchId` ni ko'rib, IKKINCHI
    // filialga biriktirilgan o'quvchini "begona" deb rad etardi.
    const student = await this.prisma.user.findUnique({
      where: { id: sid },
      select: {
        homeBranchId: true,
        branchAssignments: { select: { branchId: true } },
      },
    });
    const targetBranchIds = userBranchIds(student);
    const overlap = (req.allowedBranchIds || []).some((id) =>
      targetBranchIds.has(String(id)),
    );
    if (!overlap) {
      throw new ApiError(403, "Bu o'quvchi sizning filialingizda emas");
    }

    // O'quvchi BOSHQA filialda ham o'qiyotgan bo'lishi mumkin — oylik
    // davomat hisobotida o'sha guruhlar ko'rinib qolmasin.
    req.scopeGroupIds = await this.branchGroupIds(req);
    return true;
  }

  /**
   * Xodim ko'lamidagi guruh ID'lari.
   *   `null`  = cheklov yo'q (barcha filial)
   *   `[]`    = hech qaysi filialga biriktirilmagan → HECH NARSA
   *             ko'rmaydi (`branchFilter()` dagi FAIL-CLOSED qoidasi).
   */
  private async branchGroupIds(req: AuthenticatedRequest): Promise<string[] | null> {
    if (seesAllBranches(req)) return null;
    const allowed = req.allowedBranchIds || [];
    if (allowed.length === 0) return [];
    const groups = await this.prisma.group.findMany({
      where: { branchId: { in: allowed.map(String) } },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }
}
