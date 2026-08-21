import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JournalService } from './journal.service.js';
import { JournalVerifyService } from './journal-verify.service.js';
import { ShiftService } from './shift.service.js';
import { CashTransferService } from './cash-transfer.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  balancesSchema,
  shiftOpenSchema,
  shiftCloseSchema,
  shiftListSchema,
  transferSendSchema,
  transferReceiveSchema,
  transferIdSchema,
  transferListSchema,
  type BalancesRequest,
  type ShiftOpenRequest,
  type ShiftCloseRequest,
  type ShiftListRequest,
  type TransferSendRequest,
  type TransferReceiveRequest,
  type TransferIdRequest,
  type TransferListRequest,
} from './journal.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KASSA (qo'sh yozuv jurnali) — Express `journal.routes.js` NING TO'LIQ
 * EKVIVALENTI (9/9).
 *
 * RUXSATLAR:
 *   o'qish (qoldiq, ro'yxat)     -> finance.read
 *   amal   (smena)               -> finance.pay  (kassir ishi)
 *   inkassatsiya                 -> finance.manage_transfers
 *   tekshiruv (reconcile)        -> system.admin_access (OWNER-ONLY)
 *
 * NEGA reconcile OWNER-ONLY: u ATAYLAB filial ko'lamisiz ishlaydi -
 * butun tarmoq bo'yicha muvozanat va filiallararo tenglikni tekshiradi.
 * Filial direktoriga berilsa u boshqa filiallarning qoldiq farqlarini
 * ko'rardi.
 *
 * ⚠ E'LON TARTIBI: `GET /shifts` va `GET /transfers` — statik yo'llar,
 * bu kontrollerda `:id` li GET umuman yo'q, ya'ni to'qnashuv ham yo'q.
 * `POST /shifts/:id/close` va `POST /transfers/:id/(receive|cancel)`
 * ham bir-biriga xalaqit bermaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('journal')
@UseGuards(PermissionsGuard)
export class JournalController {
  constructor(
    private readonly journal: JournalService,
    private readonly verify: JournalVerifyService,
    private readonly shifts: ShiftService,
    private readonly transfers: CashTransferService,
  ) {}

  // ── QOLDIQLAR ──

  /**
   * KASSA QOLDIQLARI - "filialda qancha pul bor".
   * Ko'lam servis ichida (branchFilter) - filial direktori faqat
   * o'zinikini ko'radi.
   */
  @Get('balances')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async balances(@Validated(balancesSchema) v: BalancesRequest) {
    // ⚠⚠ TEKSHIRILGAN QIYMATDAN O'QILADI, XOM `req.query` DAN EMAS.
    //
    // Express `validate()` middleware'i tekshirilgan natijani so'rovga
    // QAYTA YOZADI (`if (parsed.query) req.query = parsed.query`), ya'ni
    // Express handler'i ham ZOD CHIQARGAN qiymatni ko'radi — satrni emas.
    // NestJS'dagi `@Validated()` esa `req` ni O'ZGARTIRMAYDI: u faqat
    // tekshirilgan obyektni qaytaradi.
    //
    // Bu farq JIMGINA edi va o'lchandi: `?treasuryOnly=false` da xom
    // qiymat `"false"` SATRI — JavaScript'da HAQIQAT, ya'ni NestJS
    // faqat xazina hisoblarini qaytarardi (595 bayt). Express esa
    // zod aylantirgan `false` BULEANINI ko'rib TO'LIQ ro'yxatni
    // berardi (1323 bayt). Status ikkalasida ham 200 — hech narsa
    // yiqilmasdi, javob shunchaki boshqacha bo'lardi.
    const until = v.query.until || null;
    const data = v.query.treasuryOnly
      ? await this.journal.treasuryBalances({ until })
      : await this.journal.balances({ until });
    return { success: true, data };
  }

  /**
   * SOG'LIQ TEKSHIRUVI: muvozanat + filiallararo tenglik + jurnal
   * operatsion modellar bilan mos keladimi.
   *
   * KO'LAMSIZ (butun tarmoq) - shuning uchun owner-only.
   */
  @Get('reconcile')
  @Permissions(PERMISSIONS.SYSTEM_ADMIN_ACCESS)
  async reconcile() {
    const [ledger, wiring] = await Promise.all([
      this.journal.reconcile(),
      this.verify.verify(),
    ]);
    return {
      success: true,
      data: { ok: ledger.ok && wiring.ok, ledger, wiring },
    };
  }

  // ── SMENA ──

  @Get('shifts')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async shiftList(@Validated(shiftListSchema) v: ShiftListRequest) {
    // Tekshirilgan qiymatdan — `balances` dagi izohga qarang.
    const { items, total, page, limit } = await this.shifts.list({
      status: v.query.status,
      cashierId: v.query.cashierId,
      page: Number(v.query.page) || 1,
      limit: Number(v.query.limit) || 50,
    });
    return { success: true, data: items, meta: { page, limit, total } };
  }

  /**
   * ⚠ 201 — Express `res.status(201)` beradi. NestJS'da `POST` uchun
   * STANDART ham 201, lekin dekorator ATAYLAB ochiq yoziladi: pastdagi
   * uchta `POST` esa 200 qaytaradi va standartga tayanish o'sha yerda
   * JIMGINA farq tug'dirardi.
   */
  @Post('shifts')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async shiftOpen(
    @Validated(shiftOpenSchema) v: ShiftOpenRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.shifts.open(v.body, req.user);
    return { success: true, data, message: 'Smena ochildi' };
  }

  /**
   * ⚠⚠ `@HttpCode(200)` SHART. NestJS `POST` uchun STANDART 201
   * qaytaradi, Express handler'i esa `res.json(...)` — ya'ni 200.
   * Dekoratorsiz bu JIMGINA farq bo'lardi: tana bir xil, status
   * boshqa. Klient `res.ok` ga qaraydi, shuning uchun hech narsa
   * yiqilmasdi — faqat paritet buzilardi.
   */
  @Post('shifts/:id/close')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async shiftClose(
    @Param('id') id: string,
    @Validated(shiftCloseSchema) v: ShiftCloseRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.shifts.close(id, v.body, req.user);
    // ⚠ TUR YOLG'ON GAPIRADI. Prisma'ning STATIK turi `variance` ni
    // `Decimal | null` deydi, ISH VAQTIDA esa u SON: klient
    // kengaytmasi (`decimal-to-number`) har bir model natijasini
    // chegarada sonlashtiradi. TypeScript kengaytmani ko'rmaydi.
    //
    // `Number(...)` ga O'RALMAYDI — `Number(null)` NOL beradi va
    // "farq yo'q" xabari chiqardi, Express esa o'sha holatda
    // "ORTIQCHA" derdi. Bu holat amalda yuz bermaydi (yopilgan
    // smenada `variance` doim yozilgan), lekin xabar mantig'i
    // Express bilan AYNAN bir xil qolishi kerak.
    const variance = (data as unknown as { variance: number }).variance;
    const msg =
      variance === 0
        ? "Smena yopildi - farq yo'q"
        : variance < 0
          ? `Smena yopildi - KAMOMAD ${Math.abs(variance)}`
          : `Smena yopildi - ORTIQCHA ${variance}`;
    return { success: true, data, message: msg };
  }

  // ── INKASSATSIYA ──

  @Get('transfers')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async transferList(@Validated(transferListSchema) v: TransferListRequest) {
    const { items, total, page, limit } = await this.transfers.list({
      status: v.query.status,
      page: Number(v.query.page) || 1,
      limit: Number(v.query.limit) || 50,
    });
    return { success: true, data: items, meta: { page, limit, total } };
  }

  @Post('transfers')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_TRANSFERS)
  async transferSend(
    @Validated(transferSendSchema) v: TransferSendRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transfers.send(v.body, req.user);
    return {
      success: true,
      data,
      message: "Inkassatsiya jo'natildi - pul «yo'lda» holatida",
    };
  }

  /**
   * QABUL QILISH - servis faqat QABUL QILUVCHI filialga ruxsat beradi
   * (cash-transfer.service.ts): jo'natuvchi o'zi "yetib keldi" deb
   * belgilay olsa, yo'ldagi pul nazorati ma'nosini yo'qotardi.
   */
  @Post('transfers/:id/receive')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_TRANSFERS)
  async transferReceive(
    @Param('id') id: string,
    @Validated(transferReceiveSchema) v: TransferReceiveRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transfers.receive(id, v.body, req.user);
    // Statik tur `Decimal | null`, ish vaqtida — son (yuqoridagi izoh).
    // Express `data.discrepancy ? ... : ...` deb HAQIQIYLIKKA qaraydi:
    // `null` ham, `0` ham "farq yo'q" degani.
    const discrepancy = (data as unknown as { discrepancy: number | null })
      .discrepancy;
    return {
      success: true,
      data,
      message: discrepancy ? `Qabul qilindi, FARQ: ${discrepancy}` : 'Qabul qilindi',
    };
  }

  @Post('transfers/:id/cancel')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_TRANSFERS)
  async transferCancel(
    @Param('id') id: string,
    @Validated(transferIdSchema) v: TransferIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transfers.cancel(id, v.body || {}, req.user);
    return { success: true, data, message: 'Bekor qilindi - pul kassaga qaytdi' };
  }
}
