import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { branchFilter, userBranchCondition } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { RolesHelperService, staffRoleFilter } from '../../common/rbac/roles.helper.js';
import { LEAD_PIPELINE } from '../../common/constants/lead-status.js';
import { LeadRoutingService } from './lead-routing.service.js';
import {
  getAllowedBranchIds,
  canSeeAllBranches,
} from '../../common/als/branch-context.js';
import { AuthService } from '../auth/auth.service.js';
import { GroupsService } from '../groups/groups.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIDLAR — `services/leads.service.js` EKVIVALENTI.
 *
 * ── ✅ `convert` / `convertBulk` ENDI SHU YERDA ──
 * Ular `AuthService.registerUser` (o'quvchi yaratish) va
 * `GroupsService.addStudent` (ixtiyoriy guruhga qabul) ga tayanadi.
 * Ikkalasi ham ko'chirilgach marshrutlar ochildi; biznes mantiq
 * NUSXALANMADI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠ KLIENT SHARTNOMASI: Mongo `populate` maydonning O'ZINI obyektga
 * aylantirardi (`lead.source = {_id, name}`). Prisma esa `sourceId` ni
 * satr qoldirib, `source` deb ALOHIDA maydon qo'shadi. Frontend eski
 * shaklni kutadi — javob `shapeLead()` orqali o'giriladi.
 */
const INCLUDE = {
  source: { select: { id: true, name: true } },
  direction: { select: { id: true, name: true } },
  rejectionReason: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } },
};

/** Prisma yozuvini eski populate shakliga qaytaradi. */
const shapeLead = (l: any) => {
  if (!l) return l;
  const out = withLegacyId(l) as Record<string, any>;
  // Populate qilingan ichki obyektlarda ham `_id` bo'lishi kerak.
  out.source = l.source ? withLegacyId(l.source) : null;
  out.direction = l.direction ? withLegacyId(l.direction) : null;
  out.rejectionReason = l.rejectionReason ? withLegacyId(l.rejectionReason) : null;
  out.assignedTo = l.assignedTo ? withLegacyId(l.assignedTo) : null;
  return out;
};

@Injectable()
export class LeadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BranchAccessService) private readonly branchAccess: BranchAccessService,
    @Inject(RolesHelperService) private readonly rolesHelper: RolesHelperService,
    @Inject(LeadRoutingService) private readonly routing: LeadRoutingService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}

  /**
   * LIDGA BIRIKTIRISH MUMKIN BO'LGAN XODIMLAR.
   *
   * ── ⚠ NEGA ALOHIDA, `/api/users` O'RNIGA ──
   * Lid formasidagi "Mas'ul" tanlagichi ilgari umumiy foydalanuvchilar
   * ro'yxatidan oziqlanardi. U `users.read` talab qiladi va RESEPSHIN
   * rolida bu ruxsat YO'Q — natijada lidlar sahifasi ochilishi bilan
   * 403 chiqardi, garchi odamning lidlarga to'liq huquqi bo'lsa ham.
   *
   * Ruxsatni kengaytirish (resepshinga `users.read` berish) NOTO'G'RI
   * yechim bo'lardi: u butun foydalanuvchilar bazasini — o'quvchilar,
   * telefonlar, loginlar — ochib yuborardi.
   *
   * ⚠ JAVOB ATAYLAB JUDA TOR: `_id`, ism, familiya va rol. Telefon,
   * login, filial — HECH BIRI qaytmaydi.
   */
  async assignableStaff() {
    const catalog = await this.rolesHelper.loadRoleCatalog();

    const filter: Record<string, any> = {
      isDeleted: false,
      isActive: true,
      // XODIM = o'quvchi TIPIDAGI rollardan boshqa hamma. Rol NOMIGA
      // emas TIPIGA qaraydi, ya'ni ertaga yaratilgan custom rol ham
      // avtomatik to'g'ri tomonga tushadi.
      role: staffRoleFilter(catalog),
    };

    const branchCond = userBranchCondition();
    // ⚠ `AND` ICHIGA: `userBranchCondition()` OR beradi, to'g'ridan-to'g'ri
    // qo'shilsa boshqa OR bilan to'qnashardi.
    if (branchCond) filter.AND = [branchCond];

    const rows = await this.prisma.user.findMany({
      where: filter,
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return rows.map((u) => ({
      ...(withLegacyId(u) as Record<string, unknown>),
      // Rol yorlig'i SERVERDAN: custom rollar ("Buxgalter") klient
      // tomonidagi qattiq ro'yxatda yo'q va u yerda "noma'lum rol"
      // bo'lib chiqardi.
      roleLabel: catalog.get(u.role)?.label || u.role,
    }));
  }

  async list({
    status, source, direction, assignedTo, engagement,
    search, from, to, page = 1, limit = 20,
  }: Record<string, any>) {
    // FILIAL ko'lami
    const filter: Record<string, any> = { ...branchFilter() };
    if (status) filter.status = status;
    if (source) filter.sourceId = source;
    if (direction) filter.directionId = direction;
    // "none" — mas'ul biriktirilmagan lidlar. Bu filtr aynan ENG XAVFLI
    // to'plamni ko'rsatadi: egasiz lid bilan hech kim ishlamaydi.
    if (assignedTo === 'none') filter.assignedToId = null;
    else if (assignedTo) filter.assignedToId = assignedTo;

    /**
     * ── ALOQA FILTRI ──
     *
     * `no_contact` — lid kelgan, lekin hech kim QO'LGA OLMAGAN: status
     *   hali "new" va `statusHistory` da faqat yaratilish yozuvi bor.
     *
     * `stale` — aloqa qilingan, lekin TASHLAB QO'YILGAN: ochiq
     *   bosqichda turibdi, eslatma qo'yilmagan va oxirgi harakatdan beri
     *   `STALE_DAYS` kun o'tgan.
     *
     * Ikkalasi ham "yo'qotilgan sotuv"ning eng arzon manbai: mijoz
     * allaqachon O'ZI qiziqib murojaat qilgan, faqat javob kutgan.
     */
    if (engagement === 'no_contact') {
      filter.status = 'new';
      // ⚠ `statusHistory` — Json massiv va Prisma uzunlik bo'yicha
      // filtrlay OLMAYDI. Mos ID'lar xom SQL bilan olinadi; FILIAL
      // KO'LAMI ASOSIY so'rovda qoladi, ya'ni xavfsizlik sharti SQL'da
      // TAKRORLANMAYDI (takrorlansa ikki joyda ikki xil bo'lib ketardi).
      const noContactRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM leads WHERE jsonb_array_length("statusHistory") = 1
      `;
      filter.id = { in: noContactRows.map((r) => r.id) };
    } else if (engagement === 'stale') {
      const STALE_DAYS = 7;
      filter.status = { notIn: ['enrolled', 'rejected'] };
      filter.followUpAt = null;
      filter.updatedAt = {
        lt: new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000),
      };
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.gte = new Date(from);
      if (to) filter.createdAt.lte = new Date(to);
    }
    if (search && String(search).trim()) {
      const rx = { contains: String(search).trim(), mode: 'insensitive' as const };
      // ⚠ QO'SHIMCHA RAQAM ham qidiriladi: xodim ota-onaning raqami
      // bilan qo'ng'iroq qilib, "bu kim edi?" deb qidirsa lid TOPILISHI
      // kerak. Aks holda ikkinchi raqamni saqlashning yarim ma'nosi
      // yo'qolardi.
      filter.OR = [
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
        { parentPhone: rx },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where: filter,
        // ⚠ IKKILAMCHI TARTIB (`id`): `createdAt` teng bo'lganda tartib
        // beqaror bo'lib, sahifalashda qator takrorlanishi yoki tushib
        // qolishi mumkin edi.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: INCLUDE,
      }),
      this.prisma.lead.count({ where: filter }),
    ]);
    return { items: items.map(shapeLead), total, page, limit };
  }

  async getById(id: string) {
    // FILIAL: boshqa filial lidini ID orqali ochib bo'lmaydi — `list`
    // bilan AYNAN bir xil ko'lam (`convert` dagi idiomning o'zi). Usiz
    // ro'yxatda ko'rinmaydigan lidning ismi va telefoni oshkor bo'lardi.
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...branchFilter() },
      include: INCLUDE,
    });
    if (!lead) throw new ApiError(404, 'Lid topilmadi');
    return shapeLead(lead);
  }

  private normalizeOptionalPhone(raw?: string | null): string | null {
    if (!raw) return null;
    const p = normalizePhone(raw);
    if (!p) throw new ApiError(400, "Telefon raqam noto'g'ri");
    return p;
  }

  /**
   * ⚠ IKKI RAQAM BIR XIL BO'LMASLIGI KERAK — TEKSHIRUV
   * NORMALIZATSIYADAN KEYIN.
   *
   * "+998 90 123 45 67" va "998901234567" xom holda har xil satr, lekin
   * BIR XIL raqam. Xom solishtiruv bu xatoni o'tkazib yuborardi.
   *
   * Nega muhim: qo'shimcha raqamning butun ma'nosi — birinchisi javob
   * bermaganda BOSHQA odamga qo'ng'iroq qilish. Ikkalasi bir xil bo'lsa
   * maydon to'ldirilgan KO'RINADI-yu, hech qanday foyda bermaydi.
   */
  private assertDistinctPhones(phone?: string | null, parentPhone?: string | null): void {
    if (phone && parentPhone && phone === parentPhone) {
      throw new ApiError(
        400,
        "Qo'shimcha telefon asosiy raqam bilan bir xil bo'lmasligi kerak",
      );
    }
  }

  async create(body: Record<string, any>, currentUser: any) {
    const phone = this.normalizeOptionalPhone(body.phone);
    if (!phone) throw new ApiError(400, 'Telefon kerak');

    const parentPhone = this.normalizeOptionalPhone(body.parentPhone);
    this.assertDistinctPhones(phone, parentPhone);

    /**
     * ⚠ TELEFON TAKRORLANISHI RUXSAT ETILADI (ATAYLAB, uniq tekshiruv YO'Q).
     *
     * Sabab: bitta raqam — bitta lid EMAS. Bir odam kuzda ingliz tili
     * uchun qo'ng'iroq qiladi, bahorda matematika uchun qayta murojaat
     * qiladi; ona bitta raqamdan ikki farzandini yozdiradi. Eski 409 shu
     * holatlarda resepshinni BLOKLARDI va u lidni umuman kiritmasdan
     * qo'yardi — ya'ni qoida ma'lumotni tozalash o'rniga YO'QOTARDI.
     *
     * Raqamning O'ZI esa majburiy bo'lib qoladi: bog'lanib bo'lmaydigan
     * lid — lid emas.
     */
    const status = body.status || 'new';

    /**
     * ── FILIAL: lid qaysi filialga kelgan ──
     *
     *  (a) OPERATOR kiritdi — "Barcha filiallar" rejimida klient formada
     *      aniq filialni so'raydi. Bu yo'l O'ZGARMAYDI: odam tanlagan
     *      filial HAR DOIM ustun.
     *
     *  (b) AVTOMATIK (bot, webhook) — kontekst ham, foydalanuvchi ham
     *      yo'q. Ilgari xato qaytardi va lid UMUMAN yaratilmasdi. Endi
     *      MANBA bo'yicha yo'naltiriladi.
     *
     * Zaxira zanjiri routing ichida: manba qoidasi → zaxira qoida →
     * asosiy filial. Ya'ni lid HECH QACHON yo'qolmaydi.
     */
    let branchId: string;
    let routing: { branchId: string; assigneeId: string | null } | null = null;
    if (!currentUser && !body.branchId) {
      routing = await this.routing.route({ source: body.sourceId || body.source });
      branchId = routing.branchId;
    } else {
      branchId = await this.branchAccess.resolveBranchForWrite(currentUser, body.branchId);
    }

    const actorId = currentUser?.id || currentUser?._id || null;

    const lead = await this.prisma.lead.create({
      data: {
        branchId,
        firstName: String(body.firstName).trim(),
        lastName: body.lastName ? String(body.lastName).trim() : '',
        age: body.age ?? null,
        phone,
        parentPhone,
        sourceId: body.sourceId || null,
        directionId: body.directionId || null,
        status,
        rejectionReasonId: body.rejectionReasonId || null,
        rejectionNote: (body.rejectionNote || '').trim(),
        // Darhol rad etilgan holatda yaratilsa — yopilish sanasi ham o'sha payt.
        closedAt: status === 'rejected' ? new Date() : null,
        trialDate: body.trialDate ? new Date(body.trialDate) : null,
        notes: body.notes || '',
        // Yo'naltirish qoidasi xodim ko'rsatgan bo'lsa — lid DARHOL unga
        // biriktiriladi. Aks holda filialga tushadi va admin o'zi oladi.
        assignedToId: body.assignedTo || routing?.assigneeId || null,
        createdById: actorId,
        // Json massiv: sana ISO satr sifatida (JSON'da Date turi yo'q).
        statusHistory: [{ status, at: new Date().toISOString(), by: actorId }],
      } as never,
    });
    return this.getById(lead.id);
  }

  async update(id: string, body: Record<string, any>, currentUser: any) {
    // FILIAL: boshqa filial lidini tahrirlab bo'lmaydi (`setReminderBulk`
    // dagi bilan bir xil qoida).
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...branchFilter() },
    });
    if (!lead) throw new ApiError(404, 'Lid topilmadi');

    const actorId = currentUser?.id || currentUser?._id || null;
    const data: Record<string, any> = {};

    if (body.firstName !== undefined) data.firstName = String(body.firstName).trim();
    if (body.lastName !== undefined) data.lastName = String(body.lastName).trim();
    if (body.age !== undefined) data.age = body.age ?? null;
    if (body.phone !== undefined) {
      // ⚠ Takroriy raqam BLOKLANMAYDI (yuqoridagi izoh), lekin raqamni
      // BO'SHATIB ham bo'lmaydi — tekshiruvsiz `phone = null` bo'lib,
      // foydalanuvchi tushunarsiz 500 ko'rardi.
      const phone = this.normalizeOptionalPhone(body.phone);
      if (!phone) throw new ApiError(400, 'Telefon kerak');
      data.phone = phone;
    }
    if (body.parentPhone !== undefined) {
      data.parentPhone = body.parentPhone
        ? this.normalizeOptionalPhone(body.parentPhone)
        : null;
    }
    /**
     * ⚠ TEKSHIRUV IKKALA MAYDON QO'LLANGANIDAN KEYIN: so'rovda faqat
     * bittasi kelishi mumkin va u SAQLANGAN ikkinchisi bilan
     * to'qnashishi mumkin.
     *
     * ⚠ FAQAT TELEFON TEGILGANDA tekshiriladi. Sabab: bu qoida joriy
     * qilinishidan OLDIN yaratilgan lidlarda ikkala raqam bir xil
     * bo'lishi mumkin. Har doim tekshirsak, o'sha eski lidning ISMINI
     * tahrirlash ham "telefon bir xil" xatosi bilan bloklanardi —
     * foydalanuvchi esa telefonga umuman tegmagan bo'lardi.
     */
    if (body.phone !== undefined || body.parentPhone !== undefined) {
      this.assertDistinctPhones(
        data.phone ?? lead.phone,
        data.parentPhone !== undefined ? data.parentPhone : lead.parentPhone,
      );
    }
    if (body.sourceId !== undefined) data.sourceId = body.sourceId || null;
    if (body.directionId !== undefined) data.directionId = body.directionId || null;
    if (body.rejectionReasonId !== undefined) {
      data.rejectionReasonId = body.rejectionReasonId || null;
    }
    if (body.trialDate !== undefined) {
      data.trialDate = body.trialDate ? new Date(body.trialDate) : null;
    }
    if (body.notes !== undefined) data.notes = body.notes || '';
    if (body.assignedTo !== undefined) data.assignedToId = body.assignedTo || null;
    if (body.rejectionNote !== undefined) {
      data.rejectionNote = (body.rejectionNote || '').trim();
    }

    if (body.status !== undefined && body.status !== lead.status) {
      const wasRejected = lead.status === 'rejected';
      data.status = body.status;
      // Json massivga qo'shish: `.push()` o'rniga YANGI massiv.
      data.statusHistory = [
        ...(Array.isArray(lead.statusHistory) ? (lead.statusHistory as any[]) : []),
        { status: body.status, at: new Date().toISOString(), by: actorId },
      ];

      if (body.status === 'rejected') {
        data.closedAt = new Date();
      } else if (wasRejected) {
        /**
         * ⚠ QAYTA OCHILDI: yopilish izlari TOZALANADI.
         *
         * Aks holda "yopilgan lidlar" hisobotida u hali ham yopiq
         * sanaladi va yo'qotish sababi statistikasi SHISHIB ketardi —
         * lid ikki marta (bir marta yopilgan, bir marta qayta yopilgan)
         * sanalardi.
         */
        data.closedAt = null;
        data.rejectionNote = '';
        data.rejectionReasonId = null;
      }
    }

    await this.prisma.lead.update({ where: { id }, data });
    return this.getById(id);
  }

  /** Qayta bog'lanish eslatmasini o'rnatish/o'zgartirish/o'chirish. */
  async setReminder(id: string, { followUpAt, followUpNote }: Record<string, any>) {
    // ⚠ FILIAL: boshqa filial lidiga eslatma qo'yib bo'lmaydi — ommaviy
    // egizagi (`setReminderBulk`) allaqachon shunday tekshiradi.
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...branchFilter() },
    });
    if (!lead) throw new ApiError(404, 'Lid topilmadi');

    await this.prisma.lead.update({
      where: { id },
      data: {
        followUpAt: followUpAt ? new Date(followUpAt) : null,
        followUpNote: followUpNote || '',
        // ⚠ Yangi/yangilangan eslatma QAYTA yuborilishi uchun bayroq
        // tozalanadi — aks holda eslatma vaqti o'zgarsa ham xabar
        // ikkinchi marta ketmasdi.
        followUpNotifiedAt: null,
      },
    });
    return this.getById(id);
  }

  /**
   * KO'P LIDGA BIR MARTADA eslatma.
   *
   * ⚠ HAR LID ALOHIDA ISHLANADI: bittasi topilmasa (boshqa filial,
   * o'chirilgan) QOLGANLARI baribir o'rnatiladi va natijada nima
   * yiqilgani qaytariladi. Tranzaksiya QO'YILMAYDI — 200 ta lidning
   * biri tufayli qolgan 199 tasi bekor bo'lishi mumkin emas.
   */
  async setReminderBulk({ ids = [], followUpAt, followUpNote, assignedTo }: Record<string, any>) {
    if (!ids.length) throw new ApiError(400, 'Lid tanlanmagan');
    if (new Set(ids.map(String)).size !== ids.length) {
      throw new ApiError(400, "Ro'yxatda takrorlangan lid bor");
    }

    const updated: string[] = [];
    const failed: Array<{ leadId: string; message: string }> = [];

    for (const id of ids) {
      try {
        // ⚠ FILIAL: boshqa filial lidiga eslatma qo'yib bo'lmaydi.
        const lead = await this.prisma.lead.findFirst({
          where: { id, ...branchFilter() },
        });
        if (!lead) throw new ApiError(404, 'Lid topilmadi');

        const patch: Record<string, any> = {
          followUpAt: followUpAt ? new Date(followUpAt) : null,
          followUpNote: followUpNote || '',
          followUpNotifiedAt: null,
        };
        // Mas'ul BERILGANDA almashtiriladi. Berilmasa lidning O'Z
        // mas'uli saqlanadi — ommaviy eslatma tayinlashni bekor
        // qilmasligi kerak.
        if (assignedTo !== undefined) patch.assignedToId = assignedTo || null;

        await this.prisma.lead.update({ where: { id: lead.id }, data: patch });
        updated.push(String(lead.id));
      } catch (err: any) {
        failed.push({
          leadId: String(id),
          message: err?.message || "Eslatma o'rnatilmadi",
        });
      }
    }

    return { updated, failed };
  }

  /** Vaqti kelgan, hali bildirishnoma yuborilmagan eslatmalar (job uchun). */
  dueReminders(now: Date = new Date()) {
    return this.prisma.lead.findMany({
      where: { followUpAt: { not: null, lte: now }, followUpNotifiedAt: null },
    });
  }

  /**
   * Kunlik yig'ma uchun: berilgan oraliqda vaqti kelgan/o'tib ketgan,
   * hali YOPILMAGAN lidlar.
   *
   * ⚠ Yopilgan (rad etilgan/aylantirilgan) lid uchun "bog'laning"
   * deyish — operatorni bekorga chalg'itish.
   */
  async remindersUpTo(until: Date = new Date()) {
    const rows = await this.prisma.lead.findMany({
      where: {
        followUpAt: { not: null, lte: until },
        status: { notIn: ['enrolled', 'rejected'] },
        studentId: null,
      },
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        followUpAt: true, followUpNote: true, assignedToId: true,
      },
    });
    // Chaqiruvchi eski `assignedTo` nomini kutadi.
    return rows.map((r) => ({
      ...(withLegacyId(r) as Record<string, unknown>),
      assignedTo: r.assignedToId,
    }));
  }

  async markReminderNotified(id: string, at: Date = new Date()): Promise<void> {
    await this.prisma.lead.update({
      where: { id: String(id) },
      data: { followUpNotifiedAt: at },
    });
  }

  /** ⚠ QATTIQ O'CHIRISH — Express'da ham shunday (yumshoq o'chirish YO'Q). */
  async remove(id: string) {
    // FILIAL: boshqa filial lidini o'chirib bo'lmaydi — bu QATTIQ
    // o'chirish, ya'ni qaytarib bo'lmaydigan sizish.
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...branchFilter() },
    });
    if (!lead) throw new ApiError(404, 'Lid topilmadi');
    await this.prisma.lead.delete({ where: { id } });
    return { _id: id, id };
  }

  // ═══════════════════ STATISTIKA ═══════════════════

  /** Voronka, manba/yo'nalish samaradorligi, drop-off, aloqa holati. */
  async stats({ from, to }: { from?: Date | string; to?: Date | string } = {}) {
    // ⚠ FILIAL: voronka/manba statistikasi butun tashkilotni ko'rsatardi.
    const match: Record<string, any> = { ...branchFilter() };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.gte = new Date(from);
      if (to) match.createdAt.lte = new Date(to);
    }

    const rows = await this.prisma.lead.findMany({
      where: match,
      select: {
        status: true,
        statusHistory: true,
        sourceId: true,
        directionId: true,
        // Yo'qotish tahlili uchun: sabab (tanlangan) + izoh (erkin matn).
        rejectionReasonId: true,
        rejectionNote: true,
        // "Aloqa qilinganmi?" savoliga javob beradigan maydonlar.
        followUpAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Pastdagi hisob mantig'i eski maydon nomlarini kutadi. FORMULALARGA
    // TEGMASLIK uchun shu yerda faqat nomlar moslashtiriladi.
    const leads = rows.map((l) => ({
      ...l,
      source: l.sourceId,
      direction: l.directionId,
      rejectionReason: l.rejectionReasonId,
      statusHistory: Array.isArray(l.statusHistory) ? (l.statusHistory as any[]) : [],
    }));

    // ⚠ FAQAT FAOL sozlamalar: o'chirilgan manba/yo'nalishlar
    // statistikada alohida ko'rinmasligi kerak — ular "Noma'lum"
    // guruhiga qo'shiladi.
    const options = await this.prisma.leadOption.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const nameOf = new Map(options.map((o) => [String(o.id), o.name]));

    const total = leads.length;
    const pipeIndex = (s: string) => (LEAD_PIPELINE as readonly string[]).indexOf(s);

    /** Har lid uchun voronkada erishilgan ENG UZOQ bosqich indeksi. */
    const furthestOf = (lead: any) => {
      let max = pipeIndex(lead.status);
      for (const h of lead.statusHistory || []) {
        const i = pipeIndex(h.status);
        if (i > max) max = i;
      }
      return max; // -1 agar pipeline'da bo'lmasa (mas. faqat rejected)
    };

    const byStatus: Record<string, number> = {};
    const funnelCounts = new Array(LEAD_PIPELINE.length).fill(0);
    const dropOff = new Array(LEAD_PIPELINE.length).fill(0);
    const srcAgg = new Map<string, any>();
    const dirAgg = new Map<string, any>();

    // RAD ETISH SABABLARI: "nega mijozlar kelmayapti?" savoliga javob.
    // Voronka QAYERDA yo'qotayotganini ko'rsatadi, bu esa NEGA ekanini.
    const rejAgg = new Map<string, any>();
    let rejectedTotal = 0;
    let rejectedWithoutReason = 0;

    /**
     * ── ALOQA HOLATI ──
     *
     * "Aloqa qilinmagan" ta'rifi: `statusHistory` da FAQAT yaratilish
     * yozuvi bor va status hali "new".
     *
     * ⚠ NEGA `statusHistory` BO'YICHA, `updatedAt` bo'yicha EMAS: izoh
     * yozilsa yoki telefon tuzatilsa `updatedAt` yangilanadi, lekin bu
     * ALOQA qilinganini BILDIRMAYDI. Status siljishi esa haqiqiy
     * harakat belgisi.
     */
    const engagement = { noContact: 0, contacted: 0, closed: 0 };
    let noContactOldestDays = 0;
    const nowMs = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    for (const lead of leads) {
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;

      const isClosed = lead.status === 'rejected' || lead.status === 'enrolled';
      const touched = (lead.statusHistory || []).length > 1;
      if (isClosed) {
        engagement.closed += 1;
      } else if (!touched && lead.status === 'new') {
        engagement.noContact += 1;
        const days = Math.floor((nowMs - new Date(lead.createdAt).getTime()) / DAY_MS);
        if (days > noContactOldestDays) noContactOldestDays = days;
      } else {
        engagement.contacted += 1;
      }

      if (lead.status === 'rejected') {
        rejectedTotal += 1;
        const rawRej = lead.rejectionReason ? String(lead.rejectionReason) : null;
        const rKey = rawRej && nameOf.has(rawRej) ? rawRej : 'none';
        if (rKey === 'none') rejectedWithoutReason += 1;
        if (!rejAgg.has(rKey)) rejAgg.set(rKey, { count: 0, withNote: 0 });
        const row = rejAgg.get(rKey);
        row.count += 1;
        if ((lead.rejectionNote || '').trim()) row.withNote += 1;
      }

      const furthest = furthestOf(lead);
      for (let i = 0; i <= furthest; i++) funnelCounts[i] += 1;

      if (lead.status === 'rejected' && furthest >= 0) {
        dropOff[furthest] += 1;
      }

      const isEnrolled = lead.status === 'enrolled';
      // Faol sozlamaga bog'lanmagan ID'lar "none" → Noma'lum.
      const rawSrc = lead.source ? String(lead.source) : null;
      const rawDir = lead.direction ? String(lead.direction) : null;
      const sKey = rawSrc && nameOf.has(rawSrc) ? rawSrc : 'none';
      const dKey = rawDir && nameOf.has(rawDir) ? rawDir : 'none';
      if (!srcAgg.has(sKey)) srcAgg.set(sKey, { total: 0, enrolled: 0 });
      if (!dirAgg.has(dKey)) dirAgg.set(dKey, { total: 0, enrolled: 0 });
      srcAgg.get(sKey).total += 1;
      dirAgg.get(dKey).total += 1;
      if (isEnrolled) {
        srcAgg.get(sKey).enrolled += 1;
        dirAgg.get(dKey).enrolled += 1;
      }
    }

    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

    const toRows = (agg: Map<string, any>) =>
      Array.from(agg.entries())
        .map(([key, v]) => ({
          id: key === 'none' ? null : key,
          name: key === 'none' ? "Noma'lum" : nameOf.get(key),
          total: v.total,
          enrolled: v.enrolled,
          conversionRate: pct(v.enrolled, v.total),
        }))
        .sort((a, b) => b.total - a.total);

    const funnel = (LEAD_PIPELINE as readonly string[]).map((stage, i) => ({
      stage,
      count: funnelCounts[i],
      rate: pct(funnelCounts[i], total),
    }));

    const idxTrial = (LEAD_PIPELINE as readonly string[]).indexOf('trial');
    const idxTrialAttended = (LEAD_PIPELINE as readonly string[]).indexOf('trial_attended');
    const idxEnrolled = (LEAD_PIPELINE as readonly string[]).indexOf('enrolled');

    const dropOffByStage = (LEAD_PIPELINE as readonly string[]).map((stage, i) => ({
      stage,
      count: dropOff[i],
    }));

    return {
      total,
      byStatus,
      funnel,
      rates: {
        leadToTrial: pct(funnelCounts[idxTrial], total),
        trialToEnrolled: pct(funnelCounts[idxEnrolled], funnelCounts[idxTrialAttended]),
        overallConversion: pct(funnelCounts[idxEnrolled], total),
      },
      bySource: toRows(srcAgg),
      byDirection: toRows(dirAgg),
      dropOffByStage,

      // RAD ETISH SABABLARI — eng ko'p uchraganidan boshlab.
      // `withNote` — nechtasida erkin izoh ham bor. Bu ma'lumot SIFATI
      // ko'rsatkichi: izohsiz sabab ("Boshqa") tahlil uchun deyarli
      // foydasiz.
      byRejectionReason: Array.from(rejAgg.entries())
        .map(([key, v]) => ({
          id: key === 'none' ? null : key,
          name: key === 'none' ? "Sabab ko'rsatilmagan" : nameOf.get(key),
          count: v.count,
          withNote: v.withNote,
          share: pct(v.count, rejectedTotal),
        }))
        .sort((a, b) => b.count - a.count),

      rejection: {
        total: rejectedTotal,
        withoutReason: rejectedWithoutReason,
        noteCoverage: pct(
          Array.from(rejAgg.values()).reduce((s, v) => s + v.withNote, 0),
          rejectedTotal,
        ),
      },

      // ALOQA HOLATI — "umuman aloqaga chiqilmagan" lidlar shu yerda.
      engagement: {
        ...engagement,
        noContactOldestDays,
        // Ochiq lidlar ichida hech kim tegmaganlari ulushi. Aynan shu
        // raqam "sotuv nega o'lyapti" savoliga birinchi javob.
        noContactShare: pct(
          engagement.noContact,
          engagement.noContact + engagement.contacted,
        ),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // LIDNI O'QUVCHIGA AYLANTIRISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * `registerUser` ga uzatiladigan ko'lam.
   *
   * ⚠ `assertCanAssignBranch` shunga qaraydi: usiz bir filial direktori
   * boshqasiga odam qo'shib, keyin uning parolini o'qib olardi.
   */
  private registerScope(currentUser: any) {
    return {
      allowedBranchIds: getAllowedBranchIds(),
      canSeeAllBranches: canSeeAllBranches(),
      userId: currentUser?.id || currentUser?._id || null,
    };
  }

  /**
   * Guruh mavjudmi va so'rov KO'LAMIDAMI.
   *
   * ⚠ AYLANTIRISHDAN OLDIN tekshiriladi: o'quvchi yaratilib bo'lgach
   * xato chiqsa uni orqaga qaytarib bo'lmaydi.
   */
  private async ensureGroupInScope(
    groupId: string | null | undefined, leadBranchId: string | null,
  ) {
    if (!groupId) return null;
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), isDeleted: false, ...branchFilter() },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    if (leadBranchId && String(group.branchId) !== String(leadBranchId)) {
      throw new ApiError(400, "Guruh lid filialiga tegishli emas");
    }
    return group;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * BITTA lidni o'quvchiga aylantirish + (ixtiyoriy) guruhga qo'shish.
   *
   * ⚠ GURUHGA QO'SHISH XATOSI AYLANTIRISHNI BEKOR QILMAYDI: o'quvchi
   * allaqachon yaratilgan va tranzaksiya yo'q. Xato `groupError` bo'lib
   * qaytariladi — klient ogohlantirish ko'rsatadi, operator guruhga
   * qo'lda qo'shadi.
   *
   * ⚠ FILIAL: yaratilayotgan o'quvchi LID FILIALIGA biriktiriladi. Aks
   * holda u filialsiz qolardi va `userBranchCondition()` bo'yicha FAQAT
   * `view_all` egalariga ko'rinardi — ya'ni lidni aylantirgan direktor
   * o'zi yaratgan o'quvchini ro'yxatda KO'RMAY qolardi.
   * ═══════════════════════════════════════════════════════════════════
   */
  private async convertOne(
    lead: any, body: any, currentUser: any, groupId?: string | null,
  ) {
    const student: any = await this.auth.registerUser(
      { ...body, role: 'student', homeBranchId: lead.branchId },
      this.registerScope(currentUser),
    );

    const actorId = currentUser?.id || currentUser?._id || null;
    const studentId = student.id || student._id;
    const patch: any = { studentId };

    // ⚠ ATRIBUTSIYA — KPI mukofoti KIMGA tegishli.
    //
    // Tartib: mas'ul xodim → lidni yaratgan → aylantirgan odam. BIR
    // MARTA yoziladi va keyin O'ZGARMAYDI: mas'ulni ertaga almashtirish
    // o'tgan oyning maoshini qayta yozib yuborishi mumkin emas.
    patch.creditedToId =
      lead.creditedToId || lead.assignedToId || lead.createdById || actorId || null;
    patch.convertedById = lead.convertedById || actorId || null;
    patch.convertedAt = lead.convertedAt || new Date();

    if (lead.status !== 'enrolled') {
      patch.status = 'enrolled';
      patch.statusHistory = [
        ...(Array.isArray(lead.statusHistory) ? lead.statusHistory : []),
        { status: 'enrolled', at: new Date().toISOString(), by: actorId },
      ];
    }

    // ⚠ O'QUVCHI → LID havolasi ALOHIDA yoziladi: `registerUser` hujjatni
    // QAT'IY oq ro'yxat bo'yicha quradi, ya'ni `leadId` ni body orqali
    // uzatib bo'lmaydi — u JIMGINA tushib qolardi.
    //
    // ⚠ IKKALASI BITTA TRANZAKSIYADA: Mongo'da bu ikki alohida yozuv edi
    // va oradagi xato "lid aylantirilgan, lekin o'quvchida leadId yo'q"
    // holatini qoldirardi — konversiya atributsiyasi (KPI mukofoti)
    // jimgina yo'qolardi.
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: lead.id }, data: patch }),
      this.prisma.user.update({ where: { id: studentId }, data: { leadId: lead.id } }),
    ]);

    let groupError: string | null = null;
    if (groupId) {
      try {
        // ⚠ `joinedAt` BERILMAYDI: `addStudent` guruh boshlangan sana
        // bilan o'quvchi ro'yxatga olingan sanadan KECHROG'INI oladi —
        // yangi o'quvchida bu har doim to'g'ri va tekshiruvlardan o'tadi.
        await this.groups.addStudent(groupId, String(studentId));
      } catch (err) {
        groupError = (err as Error)?.message || "Guruhga qo'shib bo'lmadi";
      }
    }

    return { student, groupError };
  }

  /** Lidni o'quvchiga aylantirish: o'quvchi yaratiladi + lid bog'lanadi. */
  async convert(id: string, body: any, currentUser: any) {
    // FILIAL: boshqa filial lidini aylantirib bo'lmaydi.
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...branchFilter() },
    });
    if (!lead) throw new ApiError(404, 'Lid topilmadi');
    if (lead.studentId) {
      throw new ApiError(409, "Bu lid allaqachon o'quvchiga aylantirilgan");
    }

    await this.ensureGroupInScope(body.groupId, lead.branchId);

    const { student, groupError } = await this.convertOne(
      lead, body, currentUser, body.groupId,
    );
    return { lead: await this.getById(lead.id), student, groupError };
  }

  /**
   * KO'P LIDNI BIR MARTADA aylantirish (yangi sotuvlar oqimi).
   *
   * ⚠ Har lid ALOHIDA ishlanadi: bittasi yiqilsa (login band, telefon
   * takrorlangan…) qolganlari BARIBIR o'tadi. Natijada har lid uchun
   * javob qaytadi — operator kimga login berilganini ko'radi.
   */
  async convertBulk(
    { leads = [], groupId }: { leads?: any[]; groupId?: string | null },
    currentUser: any,
  ) {
    if (!leads.length) throw new ApiError(400, 'Lid tanlanmagan');

    const ids = leads.map((l) => l.id);
    if (new Set(ids.map(String)).size !== ids.length) {
      throw new ApiError(400, "Ro'yxatda takrorlangan lid bor");
    }
    const usernames = leads.map((l) => String(l.username).toLowerCase().trim());
    if (new Set(usernames).size !== usernames.length) {
      throw new ApiError(400, "Ro'yxatda bir xil login ikki marta ishlatilgan");
    }

    const converted: any[] = [];
    const failed: any[] = [];

    for (const item of leads) {
      const { id, ...body } = item;
      try {
        // eslint-disable-next-line no-await-in-loop
        const lead = await this.prisma.lead.findFirst({
          where: { id, ...branchFilter() },
        });
        if (!lead) throw new ApiError(404, 'Lid topilmadi');
        if (lead.studentId) {
          throw new ApiError(409, "Bu lid allaqachon o'quvchiga aylantirilgan");
        }

        // ⚠ Guruh HAR LID uchun tekshiriladi: tanlovga TURLI filial
        // lidlari tushishi mumkin, va boshqa filial o'quvchisini bu
        // guruhga qo'shib bo'lmaydi.
        // eslint-disable-next-line no-await-in-loop
        if (groupId) await this.ensureGroupInScope(groupId, lead.branchId);

        // eslint-disable-next-line no-await-in-loop
        const { student, groupError } = await this.convertOne(
          lead, body, currentUser, groupId,
        );
        converted.push({
          leadId: String(lead.id),
          studentId: String(student.id || student._id),
          firstName: student.firstName,
          lastName: student.lastName,
          username: student.username,
          // Parol OPERATORGA qaytariladi — u o'quvchiga aytishi kerak.
          password: body.password,
          addedToGroup: Boolean(groupId) && !groupError,
          groupError,
        });
      } catch (err) {
        failed.push({
          leadId: String(id),
          name: `${item.firstName || ''} ${item.lastName || ''}`.trim(),
          message: (err as Error)?.message || "Aylantirib bo'lmadi",
        });
      }
    }

    return { converted, failed, groupId: groupId || null };
  }
}
