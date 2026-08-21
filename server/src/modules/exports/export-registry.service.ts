import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { UsersService } from '../users/users.service.js';
import { StudentPaymentService } from '../finance/student-payment.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EKSPORT REYESTRI — USTUNLARNING YAGONA MANBAI
 * (`exports/registry/*` NING KO'CHIRMASI).
 *
 * ── NEGA REYESTR (client'da takrorlash EMAS) ──
 * Client va server ALOHIDA paketlar, umumiy modul yo'q. Ustunlar
 * ro'yxati ikki joyda saqlansa, vaqt o'tib ALBATTA bir-biridan
 * uzoqlashadi. Client ustunlarni `GET /datasets` orqali SHU YERDAN
 * oladi — drift JISMONAN mumkin emas.
 *
 * ── NEGA SERVIS, oddiy modul EMAS ──
 * Express'da dataset fayllari servislarni to'g'ridan-to'g'ri import
 * qiladi. NestJS'da servislar DI orqali keladi, ya'ni reyestr
 * `@Injectable` bo'lishi SHART — aks holda `fetchPage` ichida global
 * nusxa yaratish kerak bo'lardi va u filial kontekstini (ALS) ko'rmasdi.
 *
 * ── ⚠ QAT'IY QOIDA: EKSPORT HECH QACHON O'Z SO'ROVINI YOZMAYDI ──
 * `fetchPage` MAVJUD `list()` servisini chaqiradi, chunki u
 * `branchFilter()` / `userBranchCondition()` ni allaqachon qo'llaydi.
 * Bu yerda yangi `findMany` yozilsa, filial filtri UNUTILISHI mumkin va
 * eksport JIMGINA boshqa filial ma'lumotini ochib qo'yardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  type: 'text' | 'int' | 'money' | 'date';
  default?: boolean;
  /** Ustunga XOS qo'shimcha ruxsat (dataset ruxsati yetarli bo'lmasa). */
  permission?: string;
}

export interface ExportDataset {
  key: string;
  label: string;
  /** Faylning ASCII nomi (`Content-Disposition` uchun). */
  fileBase: string;
  sheetName: string;
  permission: string;
  filterSchema: z.ZodTypeAny;
  columns: ExportColumn[];
  fetchPage: (a: { filters: any; page: number; limit: number }) => Promise<any>;
  mapRow: (doc: any) => Record<string, unknown>;
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: "To'lanmagan",
  partial: 'Qisman',
  paid: "To'langan",
};

const GENDER_LABELS: Record<string, string> = { male: 'Erkak', female: 'Ayol' };

/** Xodim/o'qituvchi ro'yxatlari uchun BIR XIL filtr sxemasi. */
const peopleFilterSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  sort: z.enum(['createdAt', 'firstName', 'lastName']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

@Injectable()
export class ExportRegistryService {
  private readonly datasets: Record<string, ExportDataset>;

  constructor(
    private readonly users: UsersService,
    private readonly payments: StudentPaymentService,
  ) {
    this.datasets = Object.freeze({
      'student-payments': this.studentPaymentsDataset(),
      teachers: this.teachersDataset(),
      staff: this.staffDataset(),
    }) as Record<string, ExportDataset>;
  }

  getDataset(key: string): ExportDataset | null {
    return this.datasets[key] || null;
  }

  listDatasets(): ExportDataset[] {
    return Object.values(this.datasets);
  }

  /**
   * Foydalanuvchi ruxsatiga ko'ra ustunlarni filtrlaydi.
   * Ustunda `permission` bo'lmasa — dataset ruxsati YETARLI.
   */
  visibleColumns(dataset: ExportDataset, permissions?: string[]): ExportColumn[] {
    return dataset.columns.filter(
      (col) => !col.permission || hasPermission(permissions, col.permission),
    );
  }

  /**
   * Client so'ragan ustun kalitlarini reyestr bo'yicha OQ RO'YXATLAYDI.
   *
   * ⚠ Reyestrda YO'Q yoki ruxsat yetmaydigan kalit JIMGINA tashlanadi —
   * xato qaytarilmaydi, chunki bu client'ga qaysi maydonlar mavjudligini
   * ("passwordHash bor ekan") OSHKOR qilardi.
   *
   * Tartib CLIENT'NIKI: foydalanuvchi ustunlarni qanday tartibda
   * tanlagan bo'lsa, Excel'da ham shunday chiqadi.
   */
  resolveColumns(
    dataset: ExportDataset, permissions?: string[], requestedKeys?: string[],
  ): ExportColumn[] {
    const allowed = this.visibleColumns(dataset, permissions);
    if (!requestedKeys?.length) return allowed.filter((c) => c.default);

    const byKey = new Map(allowed.map((c) => [c.key, c]));
    const seen = new Set<string>();
    const picked: ExportColumn[] = [];
    for (const key of requestedKeys) {
      const col = byKey.get(key);
      if (!col || seen.has(key)) continue;
      seen.add(key);
      picked.push(col);
    }
    return picked;
  }

  // ══════════════════════════ DATASET'LAR ══════════════════════════

  /**
   * O'QUVCHI TO'LOVLARI.
   *
   * ⚠ `page`/`limit` filtr sxemasida ATAYLAB YO'Q — eksport doim BUTUN
   * natijani oladi, sahifani emas.
   */
  private studentPaymentsDataset(): ExportDataset {
    return {
      key: 'student-payments',
      label: "O'quvchi to'lovlari",
      fileBase: 'oquvchi-tolovlari',
      sheetName: "To'lovlar",
      permission: PERMISSIONS.FINANCE_READ,

      filterSchema: z.object({
        groupId: z.string().optional(),
        year: z.coerce.number().int().min(2000).max(3000).optional(),
        month: z.coerce.number().int().min(1).max(12).optional(),
        status: z.enum(['unpaid', 'partial', 'paid']).optional(),
        search: z.string().trim().optional(),
      }),

      columns: [
        { key: 'studentName', header: 'Ism familiya', width: 28, type: 'text', default: true },
        { key: 'username', header: 'Login', width: 16, type: 'text', default: false },
        // ⚠ TELEFON ATAYLAB ALOHIDA RUXSAT OSTIDA: moliyani ko'rish
        // huquqi o'quvchilar TELEFON BAZASINI yuklab olish huquqini
        // BERMASLIGI kerak.
        {
          key: 'studentPhone', header: 'Telefon', width: 16, type: 'text',
          default: false, permission: PERMISSIONS.STUDENTS_READ,
        },
        { key: 'groupName', header: 'Guruh', width: 22, type: 'text', default: true },
        { key: 'year', header: 'Yil', width: 8, type: 'int', default: true },
        { key: 'month', header: 'Oy', width: 8, type: 'int', default: true },
        { key: 'baseFee', header: "Asosiy narx (so'm)", width: 18, type: 'money', default: false },
        { key: 'discountApplied', header: "Chegirma (so'm)", width: 16, type: 'money', default: false },
        { key: 'expectedAmount', header: "Hisoblangan (so'm)", width: 18, type: 'money', default: true },
        { key: 'paidAmount', header: "To'langan (so'm)", width: 18, type: 'money', default: true },
        { key: 'remaining', header: "Qoldiq (so'm)", width: 16, type: 'money', default: true },
        { key: 'statusLabel', header: 'Holat', width: 14, type: 'text', default: true },
        { key: 'writtenOff', header: 'Hisobdan chiqarilgan', width: 20, type: 'text', default: false },
        { key: 'writeOffAmount', header: "Yomon qarz (so'm)", width: 18, type: 'money', default: false },
        { key: 'createdAt', header: 'Yaratilgan', width: 14, type: 'date', default: false },
      ],

      fetchPage: ({ filters, page, limit }) =>
        this.payments.list({ ...filters, page, limit }),

      mapRow: (doc: any) => {
        const expected = Number(doc.expectedAmount || 0);
        const paid = Number(doc.paidAmount || 0);
        return {
          studentName: [doc.student?.firstName, doc.student?.lastName]
            .filter(Boolean).join(' '),
          username: doc.student?.username || '',
          studentPhone: doc.student?.phone || '',
          groupName: doc.group?.name || '',
          year: doc.year,
          month: doc.month,
          baseFee: Number(doc.baseFee || 0),
          discountApplied: Number(doc.discountApplied || 0),
          expectedAmount: expected,
          paidAmount: paid,
          remaining: Math.max(0, expected - paid),
          statusLabel: STATUS_LABELS[doc.status] || doc.status || '',
          writtenOff: doc.writtenOff ? 'Ha' : "Yo'q",
          writeOffAmount: Number(doc.writeOffAmount || 0),
          createdAt: doc.createdAt || null,
        };
      },
    };
  }

  /**
   * O'QITUVCHILAR.
   *
   * ⚠ `role` ATAYLAB `filterSchema` DA YO'Q — u `fetchPage` da QATTIQ
   * belgilangan. Aks holda client `role="owner"` yuborib, owner
   * hisoblarini yuklab olardi.
   */
  private teachersDataset(): ExportDataset {
    return {
      key: 'teachers',
      label: "O'qituvchilar",
      fileBase: 'oqituvchilar',
      sheetName: "O'qituvchilar",
      permission: PERMISSIONS.TEACHERS_READ,
      filterSchema: peopleFilterSchema,

      columns: [
        { key: 'fullName', header: 'Ism familiya', width: 28, type: 'text', default: true },
        { key: 'username', header: 'Login', width: 16, type: 'text', default: true },
        { key: 'phone', header: 'Telefon', width: 16, type: 'text', default: true },
        { key: 'branchName', header: 'Filial', width: 20, type: 'text', default: true },
        { key: 'hiredAt', header: 'Ishga kirgan', width: 14, type: 'date', default: true },
        { key: 'statusLabel', header: 'Holat', width: 12, type: 'text', default: true },
        { key: 'birthDate', header: "Tug'ilgan sana", width: 14, type: 'date', default: false },
        { key: 'genderLabel', header: 'Jinsi', width: 10, type: 'text', default: false },
        { key: 'extraBranches', header: "Qo'shimcha filiallar", width: 24, type: 'int', default: false },
        { key: 'createdAt', header: "Qo'shilgan", width: 14, type: 'date', default: false },
      ],

      fetchPage: ({ filters, page, limit }) =>
        this.users.list({
          ...filters,
          role: ROLES.TEACHER,
          status: filters.status || 'active',
          page,
          limit,
        }),

      mapRow: (doc: any) => ({
        fullName: [doc.firstName, doc.lastName].filter(Boolean).join(' '),
        username: doc.username || '',
        phone: doc.phone || '',
        branchName: doc.homeBranchId?.name || '',
        hiredAt: doc.hiredAt || null,
        statusLabel: doc.isActive ? 'Faol' : 'Arxiv',
        birthDate: doc.birthDate || null,
        genderLabel: GENDER_LABELS[doc.gender] || '',
        extraBranches: (doc.branchAssignments || []).length,
        createdAt: doc.createdAt || null,
      }),
    };
  }

  /**
   * XODIMLAR.
   *
   * ⚠ `role` ATAYLAB `filterSchema` DA YO'Q; `staff: true` QATTIQ
   * belgilangan — ro'yxat bilan BIR XIL ta'rif (o'quvchidan boshqa hamma).
   *
   * ⚠⚠ PAROL USTUNI HECH QACHON QO'SHILMAYDI: parollar ochiq matnda
   * saqlanadi va faqat owner uchun `/users/:id/password` orqali
   * beriladi. Ustun nomi eksport so'rovining AUDIT yozuviga ham tushib
   * qolardi.
   */
  private staffDataset(): ExportDataset {
    return {
      key: 'staff',
      label: 'Xodimlar',
      fileBase: 'xodimlar',
      sheetName: 'Xodimlar',
      permission: PERMISSIONS.USERS_READ,
      filterSchema: peopleFilterSchema,

      columns: [
        { key: 'fullName', header: 'Ism familiya', width: 28, type: 'text', default: true },
        { key: 'username', header: 'Login', width: 16, type: 'text', default: true },
        { key: 'phone', header: 'Telefon', width: 16, type: 'text', default: true },
        { key: 'roleLabel', header: 'Rol', width: 20, type: 'text', default: true },
        { key: 'branchName', header: 'Filial', width: 20, type: 'text', default: true },
        { key: 'statusLabel', header: 'Holat', width: 12, type: 'text', default: true },
        { key: 'lastLoginAt', header: 'Oxirgi kirish', width: 16, type: 'date', default: true },
        { key: 'hiredAt', header: 'Ishga kirgan', width: 14, type: 'date', default: false },
        { key: 'extraBranches', header: "Qo'shimcha filiallar", width: 24, type: 'int', default: false },
        { key: 'createdAt', header: "Qo'shilgan", width: 14, type: 'date', default: false },
      ],

      fetchPage: ({ filters, page, limit }) =>
        this.users.list({
          ...filters,
          staff: true,
          status: filters.status || 'active',
          page,
          limit,
        }),

      mapRow: (doc: any) => ({
        fullName: [doc.firstName, doc.lastName].filter(Boolean).join(' '),
        username: doc.username || '',
        phone: doc.phone || '',
        // `staff: true` bo'lgani uchun `roleLabel` ro'yxatda ALLAQACHON bor.
        roleLabel: doc.roleLabel || doc.role || '',
        branchName: doc.homeBranchId?.name || '',
        statusLabel: doc.isActive ? 'Faol' : 'Arxiv',
        lastLoginAt: doc.lastLoginAt || null,
        hiredAt: doc.hiredAt || null,
        extraBranches: (doc.branchAssignments || []).length,
        createdAt: doc.createdAt || null,
      }),
    };
  }
}
