import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { LeadRoutingService } from './lead-routing.service.js';
import { LeadConversionService } from './lead-conversion.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema, listSchema, statsSchema, createSchema, updateSchema,
  reminderSchema, reminderBulkSchema,
  routingCreateSchema, routingUpdateSchema, routingIdSchema,
  type IdRequest, type ListRequest, type StatsRequest,
  type CreateRequest, type UpdateRequest,
  type ReminderRequest, type ReminderBulkRequest,
  type RoutingCreateRequest, type RoutingUpdateRequest, type RoutingIdRequest,
} from './leads.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIDLAR — Express `leads.routes.js` NING 14/16 MARSHRUTI.
 *
 * ⚠⚠ E'LON TARTIBI EXPRESS BILAN AYNAN BIR XIL VA O'ZGARTIRILMASIN.
 *
 * `/conversion`, `/routing*`, `/stats`, `/assignees` — HAMMASI `GET /:id`
 * DAN OLDIN. Aks holda ular lid ID'si deb o'qilardi:
 *   • `/routing` `leads.manage` ostida, `/:id` esa `leads.read` —
 *     ya'ni to'siq JIMGINA yumshardi;
 *   • `/assignees` esa ObjectId validatsiyasida yiqilardi.
 *
 * `/convert-bulk` va `/reminder-bulk` ham mos `/:id/...` yo'llaridan
 * OLDIN turadi — yo'llar farq qilsa ham, tartib NIYATNI ochiq ko'rsatadi.
 *
 * ── ⚠ KO'CHIRILMAGAN 2 MARSHRUT (BLOKLANGAN, SCAFFOLD EMAS) ──
 *
 *   POST /leads/convert-bulk
 *   POST /leads/:id/convert
 *
 * Ular `GroupsService.addStudent` ga tayanadi va `groups` moduli
 * NestJS'da HOZIRCHA FAQAT O'QISH (yozish metodlari yo'q). Biznes
 * mantiq NUSXALANMADI — bu yerda ular UMUMAN E'LON QILINMAGAN, ya'ni
 * NestJS 404 qaytaradi va paritet testi ularni Express'ga qarshi
 * SOLISHTIRMAYDI. Bog'liqlik `MIGRATION-CHECKLIST.md` da qayd etilgan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('leads')
@UseGuards(PermissionsGuard)
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly routing: LeadRoutingService,
    private readonly conversionSvc: LeadConversionService,
  ) {}

  /**
   * KONVERSIYA TAQQOSLASH. ⚠ `/:id` DAN OLDIN.
   *
   * `leads.read` YETARLI — filial rahbari o'z xodimlarining ish sifatini
   * ko'rishi kerak. Ko'lam servisda (`branchFilter`).
   */
  @Get('conversion')
  @Permissions(PERMISSIONS.LEADS_READ)
  async conversion(@Req() req: AuthenticatedRequest) {
    const data = await this.conversionSvc.conversion({
      from: (req.query.from as string) || null,
      to: (req.query.to as string) || null,
    });
    return { success: true, data };
  }

  /**
   * ⚠ YO'NALTIRISH QOIDALARI — `leads.manage` (oddiy `leads.create` EMAS).
   * Qoida BUTUN MARKAZGA ta'sir qiladi: qaysi filial qaysi manbadan lid
   * oladi.
   */
  @Get('routing')
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async routingList() {
    return { success: true, data: await this.routing.list() };
  }

  @Post('routing')
  @HttpCode(201)
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async routingCreate(@Validated(routingCreateSchema) v: RoutingCreateRequest) {
    const data = await this.routing.create(v.body);
    return { success: true, data, message: "Qoida qo'shildi" };
  }

  @Patch('routing/:id')
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async routingUpdate(@Validated(routingUpdateSchema) v: RoutingUpdateRequest) {
    const data = await this.routing.update(v.params.id, v.body);
    return { success: true, data, message: 'Saqlandi' };
  }

  @Delete('routing/:id')
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async routingRemove(@Validated(routingIdSchema) v: RoutingIdRequest) {
    await this.routing.remove(v.params.id);
    return { success: true, message: "Qoida o'chirildi" };
  }

  @Get()
  @Permissions(PERMISSIONS.LEADS_READ)
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.leads.list({
      status: v.query.status,
      source: v.query.source,
      direction: v.query.direction,
      assignedTo: v.query.assignedTo,
      engagement: v.query.engagement,
      search: v.query.search,
      from: v.query.from,
      to: v.query.to,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** ⚠ `/:id` DAN OLDIN. */
  @Get('stats')
  @Permissions(PERMISSIONS.LEADS_READ)
  async stats(@Validated(statsSchema) v: StatsRequest) {
    return { success: true, data: await this.leads.stats(v.query) };
  }

  /**
   * LIDGA BIRIKTIRILADIGAN XODIMLAR (tanlagich uchun). ⚠ `/:id` DAN OLDIN.
   *
   * ⚠ SAHIFALASH YO'Q: xodimlar soni o'nlab, yuzlab emas — tanlagich
   * ro'yxati bir so'rovda TO'LIQ keladi.
   *
   * Ruxsat `leads.read` (`users.read` EMAS) — sabab servisda batafsil.
   */
  @Get('assignees')
  @Permissions(PERMISSIONS.LEADS_READ)
  async assignees() {
    return { success: true, data: await this.leads.assignableStaff() };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.LEADS_READ)
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.leads.getById(v.params.id) };
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.LEADS_CREATE)
  async create(@Validated(createSchema) v: CreateRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.leads.create(v.body, req.user);
    return { success: true, data, message: "Lid qo'shildi" };
  }

  /** ⚠ `/:id/reminder` DAN OLDIN. */
  @Post('reminder-bulk')
  @HttpCode(200)
  @Permissions(PERMISSIONS.LEADS_UPDATE)
  async reminderBulk(@Validated(reminderBulkSchema) v: ReminderBulkRequest) {
    const data = await this.leads.setReminderBulk({
      ids: v.body.ids,
      followUpAt: v.body.followUpAt,
      followUpNote: v.body.followUpNote,
      assignedTo: v.body.assignedTo,
    });
    const ok = data.updated.length;
    const bad = data.failed.length;
    const verb = v.body.followUpAt ? "o'rnatildi" : "o'chirildi";
    const message = bad
      ? `${ok} ta lidga eslatma ${verb}, ${bad} tasida xatolik`
      : `${ok} ta lidga eslatma ${verb}`;
    return { success: true, data, message };
  }

  @Post(':id/reminder')
  @HttpCode(200)
  @Permissions(PERMISSIONS.LEADS_UPDATE)
  async reminder(@Validated(reminderSchema) v: ReminderRequest) {
    const data = await this.leads.setReminder(v.params.id, {
      followUpAt: v.body.followUpAt,
      followUpNote: v.body.followUpNote,
    });
    // ⚠ XABAR NATIJAGA QARAB: eslatma o'chirilganda "o'rnatildi" deyish
    // foydalanuvchini chalg'itardi.
    const message = (data as any).followUpAt ? "Eslatma o'rnatildi" : "Eslatma o'chirildi";
    return { success: true, data, message };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.LEADS_UPDATE)
  async update(@Validated(updateSchema) v: UpdateRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.leads.update(v.params.id, v.body, req.user);
    return { success: true, data, message: 'Saqlandi' };
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    await this.leads.remove(v.params.id);
    return { success: true, message: "O'chirildi" };
  }
}
