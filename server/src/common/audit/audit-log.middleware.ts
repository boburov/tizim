import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { sanitize, extractResource, truncateBody } from './audit-log.helper.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLATFORMA AUDIT IZI — YOZISH TOMONI.
 *
 * `server_legacy/src/middleware/auditLog.middleware.js` NING KO'CHIRMASI.
 *
 * ── NEGA QAYTA TIKLANDI ──
 *
 * Express o'chirilganda (`2c7e221`) audit YOZUVCHISI ham u bilan ketdi va
 * NestJS tomonida O'RNI QOLMADI: `activityLog.create` butun `src/` bo'ylab
 * BITTA marta ham chaqirilmasdi. Jadval o'qilardi (`activity-logs` moduli,
 * owner panelidagi sahifa), lekin unga hech narsa yozilmasdi — ya'ni
 * sahifa jimgina MUZLAB qolgan tarixni ko'rsatardi.
 *
 * ── NEGA MIDDLEWARE, INTERCEPTOR EMAS ──
 *
 * `res.on('finish')` — javob HAQIQATAN yuborilgandan keyin ishlaydi, ya'ni
 * `status` va `durationMs` haqiqiy qiymat bo'ladi. Interceptor esa
 * qo'riqchi rad etgan (403) yoki marshrut topilmagan (404) so'rovlarni
 * ko'rmaydi — aynan o'sha ikkitasi audit uchun eng qimmatlisi.
 *
 * ── TARTIB MUHIM EMAS ──
 *
 * `req.user` ni `AuthMiddleware` o'rnatadi. Bu middleware undan OLDIN
 * ishlashi mumkin, lekin yozuv `finish` da tuziladi — o'shanda `req.user`
 * allaqachon joyida. `actorLabel` esa ATAYLAB boshida o'qiladi: login
 * so'rovida `req.user` hech qachon paydo bo'lmaydi, shuning uchun
 * hech bo'lmasa KIM urinayotgani saqlanadi.
 *
 * ── SO'ROVNI HECH QACHON YIQITMAYDI ──
 *
 * Yozish `setImmediate` ichida, javob yuborilgandan KEYIN. Xato bo'lsa
 * faqat `warn` yoziladi — audit jurnalining nosozligi biznes amalini
 * bekor qilmasligi kerak.
 *
 * ── FILIAL KO'LAMI ──
 *
 * `branchId` SHU YERDA yoziladi — hodisa QAYSI FILIALDA sodir bo'lgani.
 *
 * Ilgari bu ustun yo'q edi va ko'lam faqat AKTYOR orqali berilardi
 * ("shu filial xodimi qilgan ish"). Ikkalasi bir xil emas: markazdan
 * kelgan ega yoki hisobchi filialda o'zgarish qilsa, filial
 * administratori uni ko'rmasdi — o'z filialining tarixi to'liq emasdi.
 *
 * ⚠ `req.branchId` — `BranchContextMiddleware` hal qilgan JORIY filial
 * (`x-branch-id` sarlavhasi + ruxsat etilgan ro'yxat kesishmasi), ya'ni
 * u ALLAQACHON tekshirilgan: aktyor o'zi kira olmaydigan filial nomidan
 * yozuv qoldira olmaydi.
 *
 * ⚠ `null` — XATO EMAS: login/logout va "barcha filiallar" rejimidagi
 * markaz amallari bitta filialga tegishli emas. O'qish tomoni bu
 * qatorlarni aktyor filiali bo'yicha hal qiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** O'qish so'rovlari yozilmaydi — aks holda jadval shovqinga to'lardi. */
const TRACKED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Token yangilash — FON jarayoni. U har 15 daqiqada takrorlanadi va
 * haqiqiy hodisalarni ko'rinmas qilib qo'yardi.
 */
const IGNORED_PATHS = new Set(['/api/auth/refresh', '/auth/refresh']);

const pathOf = (req: AuthenticatedRequest): string =>
  String(req.originalUrl || req.path || '').split('?')[0];

/**
 * Autentifikatsiyadan OLDINGI so'rovda (login) hech bo'lmasa kim
 * urinayotganini saqlaymiz.
 */
const extractActorLabel = (req: AuthenticatedRequest): string => {
  if (req.user) return '';
  const body = (req.body || {}) as Record<string, unknown>;
  return String(body.login || body.username || body.phone || '').slice(0, 120);
};

@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuditLog');

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  use(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!TRACKED_METHODS.has(req.method)) return next();
    if (IGNORED_PATHS.has(pathOf(req))) return next();

    const startedAt = Date.now();
    // ⚠ HOZIR o'qiladi: `req.body` ni handler'lar o'zgartirishi mumkin.
    const actorLabel = extractActorLabel(req);

    res.on('finish', () => {
      setImmediate(async () => {
        try {
          const safeBody = truncateBody(sanitize(req.body || {}));
          const resource = extractResource(req.originalUrl || req.path);

          // ⚠ `req.user` BO'LMASA `req.auditActor`. Login/logout
          // autentifikatsiyadan OLDIN keladi va `AuthMiddleware` ularga
          // ulanmagan — `req.user` hech qachon paydo bo'lmaydi. Handler
          // muvaffaqiyat bo'lsa `auditActor` ni to'ldiradi, biz esa uni
          // `finish` da o'qiymiz (handler allaqachon tugagan).
          //
          // Usiz har login `userId: null, userRole: 'system'` bo'lib
          // yozilardi — o'lchandi: 2 395 ta anonim login.
          const actor = req.user
            ? { id: String(req.user.id), role: req.user.role, branchId: req.branchId }
            : req.auditActor;

          await this.prisma.activityLog.create({
            data: {
              // `user` EMAS, `userId` — Prisma'da `user` bu RELATION.
              userId: actor?.id ? String(actor.id) : null,
              userRole: actor?.role || 'system',
              // Hodisa QAYSI filialda. `undefined` bo'lsa `null` —
              // ustun ixtiyoriy va "filialsiz" haqiqiy holat.
              branchId: actor?.branchId ? String(actor.branchId) : null,
              actorLabel,
              method: req.method as never,
              path: req.originalUrl || req.path,
              status: res.statusCode || 0,
              durationMs: Date.now() - startedAt,
              ip: req.ip || '',
              userAgent: req.get('user-agent') || '',
              // Ustun `Json?` — `undefined` yozib bo'lmaydi, `null` kerak.
              body: (safeBody ?? null) as never,
              resourceType: resource.type,
              resourceId: resource.id,
            },
          });
        } catch (err) {
          this.logger.warn(
            `AuditLog yozib bo'lmadi (${req.method} ${pathOf(req)}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      });
    });

    next();
  }
}
