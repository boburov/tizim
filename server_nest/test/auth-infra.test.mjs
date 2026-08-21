/**
 * FAZA 2.1 — INFRATUZILMA XAVFSIZLIK TESTI.
 *
 * Auth middleware, ALS, qo'riqchilar va xato filtri HAQIQIY baza va
 * HAQIQIY JWT bilan tekshiriladi. Marshrut yo'q — middleware DI
 * konteyneridan olinadi va to'g'ridan-to'g'ri chaqiriladi.
 *
 * ⚠ BAZAGA YOZMAYDI. Faqat mavjud foydalanuvchilarni o'qiydi.
 *
 * ISHLATISH:  npm run build && npm run test:auth-infra
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { AuthMiddleware } from '../dist/middleware/auth.middleware.js';
import { PermissionService, hasPermission, hasAnyPermission } from '../dist/common/rbac/permission.service.js';
import { BranchAccessService, resolveRoleForBranch, assertTargetInScope, assertCanAssignBranch } from '../dist/common/rbac/branch-access.service.js';
import { PermissionsGuard } from '../dist/common/guards/permissions.guard.js';
import { RolesGuard } from '../dist/common/guards/roles.guard.js';
import { PermissionOrSelfGuard } from '../dist/common/guards/permission-or-self.guard.js';
import { Reflector } from '@nestjs/core';
import {
  runWithBranchContext, branchFilter, userBranchCondition, isBranchAllowed,
  assertBranchInScope, getActiveBranchId,
} from '../dist/common/als/branch-context.js';
import { withLegacyId } from '../dist/common/utils/serialize.js';
import { hashPassword, comparePassword } from '../dist/common/utils/password.js';
import { signAccess } from '../dist/common/utils/jwt.js';
import { PERMISSIONS, ROLES } from '../dist/common/constants/permissions.js';
import { ApiError } from '../dist/common/errors/api-error.js';

const R = { pass: 0, fail: 0 };
const ok = (n, x = '') => { R.pass += 1; console.log(`  ✅ ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x = '') => { R.fail += 1; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); };
const check = (n, cond, x = '') => (cond ? ok(n, x) : bad(n, x));

const jwtSettings = {
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtl: '15m',
  refreshTtl: '7d',
};

/** Middleware'ni soxta req/res bilan yurgizadi va natijani qaytaradi. */
const runMiddleware = (mw, req) =>
  new Promise((resolve) => {
    const r = { method: 'GET', headers: {}, params: {}, query: {}, ...req };
    mw.use(r, {}, (err) => resolve({ err, req: r, ctx: getActiveBranchId() }));
  });

const run = async () => {
  console.log('\n\x1b[1mFaza 2.1 — infratuzilma xavfsizlik testi\x1b[0m\n');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const mw = app.get(AuthMiddleware);
  const perms = app.get(PermissionService);
  const branchAccess = app.get(BranchAccessService);
  const reflector = app.get(Reflector);

  try {
    // ─── 1. SOF RUXSAT MANTIG'I ──────────────────────────────────────
    console.log('\x1b[1m  Ruxsat mantig\'i\x1b[0m');
    check('owner ["*"] hamma narsaga ruxsat beradi', hasPermission(['*'], 'anything.at.all'));
    check('aniq kalit ishlaydi', hasPermission(['users.read'], 'users.read'));
    check('yo\'q kalit rad etiladi', !hasPermission(['users.read'], 'users.create'));
    check('iyerarxiya: leads.manage → leads.create', hasPermission(['leads.manage'], 'leads.create'));
    check('iyerarxiya BIR TOMONLAMA: leads.create ↛ leads.manage',
      !hasPermission(['leads.create'], 'leads.manage'));
    check('iyerarxiya: finance.pay → finance.manage_transfers',
      hasPermission(['finance.pay'], 'finance.manage_transfers'));
    check('hasAnyPermission OR semantikasi', hasAnyPermission(['b'], ['a', 'b']));
    check('bo\'sh ruxsat ro\'yxati fail-closed', !hasPermission([], 'users.read') && !hasPermission(null, 'x'));

    // ─── 2. ALS — FILIAL KO'LAMI ─────────────────────────────────────
    console.log('\n\x1b[1m  ALS filial ko\'lami\x1b[0m');
    check('kontekstsiz branchFilter bo\'sh (job/seed)', Object.keys(branchFilter()).length === 0);
    runWithBranchContext({ branchId: 'B1', allowedBranchIds: ['B1'], canSeeAllBranches: false, userId: 'u' }, () => {
      check('aniq filial → { branchId: id }', branchFilter().branchId === 'B1');
      check('isBranchAllowed o\'ziga true', isBranchAllowed('B1'));
      check('isBranchAllowed begonaga false', !isBranchAllowed('B2'));
    });
    runWithBranchContext({ branchId: null, allowedBranchIds: [], canSeeAllBranches: false, userId: 'u' }, () => {
      const f = branchFilter();
      check('FAIL-CLOSED: biriktirilmagan odam → { in: [] }',
        Array.isArray(f.branchId?.in) && f.branchId.in.length === 0);
      const c = userBranchCondition();
      check('FAIL-CLOSED: userBranchCondition → { id: { in: [] } }',
        Array.isArray(c?.id?.in) && c.id.in.length === 0);
    });
    runWithBranchContext({ branchId: null, allowedBranchIds: ['B1','B2'], canSeeAllBranches: true, userId: 'u' }, () => {
      check('view_all + filialsiz → filtr YO\'Q', Object.keys(branchFilter()).length === 0);
      check('view_all → userBranchCondition null', userBranchCondition() === null);
    });

    // ALS IZOLYATSIYASI — parallel "so'rovlar" bir-birini buzmaydi.
    const seen = await Promise.all([1, 2, 3].map((i) =>
      new Promise((resolve) => runWithBranchContext(
        { branchId: `B${i}`, allowedBranchIds: [`B${i}`], canSeeAllBranches: false, userId: `u${i}` },
        () => setTimeout(() => resolve(branchFilter().branchId), 5 * (4 - i)),
      ))));
    check('ALS izolyatsiyasi: parallel kontekstlar aralashmaydi',
      JSON.stringify(seen) === JSON.stringify(['B1', 'B2', 'B3']), seen.join(','));

    // ?branchId= KO'LAMNI KENGAYTIRA OLMAYDI
    runWithBranchContext({ branchId: 'B1', allowedBranchIds: ['B1'], canSeeAllBranches: false, userId: 'u' }, () => {
      let threw = null;
      try { assertBranchInScope('B2'); } catch (e) { threw = e; }
      check('assertBranchInScope: begona filial → 403', threw?.statusCode === 403);
      let ok2 = true;
      try { assertBranchInScope('B1'); } catch { ok2 = false; }
      check('assertBranchInScope: o\'z filiali o\'tadi', ok2);
    });

    // ─── 3. ESKALATSIYA QO'RIQCHILARI ────────────────────────────────
    console.log('\n\x1b[1m  Eskalatsiya qo\'riqchilari\x1b[0m');
    const t = (fn) => { try { fn(); return null; } catch (e) { return e; } };
    check('assertCanAssignBranch: begona filialga → 403',
      t(() => assertCanAssignBranch(['B1'], false, 'B2'))?.statusCode === 403);
    check('assertCanAssignBranch: view_all o\'tadi', t(() => assertCanAssignBranch([], true, 'B9')) === null);
    check('assertTargetInScope: filialsiz nishon → 403',
      t(() => assertTargetInScope(['B1'], false, { homeBranchId: null, branchAssignments: [] }))?.statusCode === 403);
    check('assertTargetInScope: kesishuv bor → o\'tadi',
      t(() => assertTargetInScope(['B1'], false, { homeBranchId: 'B1', branchAssignments: [] })) === null);
    check('resolveRoleForBranch: filialga xos rol ustun',
      resolveRoleForBranch({ role: 'teacher', branchAssignments: [{ branchId: 'B1', role: 'director' }] }, 'B1') === 'director');
    check('resolveRoleForBranch: filialsiz → asosiy rol',
      resolveRoleForBranch({ role: 'teacher', branchAssignments: [] }, null) === 'teacher');

    // ─── 4. AUTH MIDDLEWARE (haqiqiy JWT + baza) ─────────────────────
    console.log('\n\x1b[1m  Auth middleware\x1b[0m');
    let r = await runMiddleware(mw, { headers: {} });
    check('token yo\'q → 401', r.err?.statusCode === 401);
    r = await runMiddleware(mw, { headers: { authorization: 'Bearer garbage' } });
    check('buzuq token → 401', r.err?.statusCode === 401);

    const owner = await prisma.user.findFirst({ where: { role: ROLES.OWNER, isActive: true } });
    if (!owner) { bad('owner topilmadi — testni bajarib bo\'lmadi'); }
    else {
      const token = signAccess({ sub: owner.id, role: owner.role }, jwtSettings);
      r = await runMiddleware(mw, { headers: { authorization: `Bearer ${token}` } });
      check('to\'g\'ri token o\'tadi', !r.err && r.req.user?.id === owner.id);
      check('owner ruxsatlari ["*"]', r.req.permissions?.includes('*'));
      check('req.user._id taxallusi bor', r.req.user?._id === owner.id);
      check('baseRole va role to\'ldirilgan', Boolean(r.req.baseRole && r.req.role));
      check('allowedBranchIds hisoblangan', Array.isArray(r.req.allowedBranchIds));
      check('ALS kontekst next() ichida OCHIQ edi', r.ctx !== undefined);

      // O'CHIRILGAN/NOFAOL foydalanuvchi
      const inactive = await prisma.user.findFirst({ where: { isActive: false } });
      if (inactive) {
        const tk = signAccess({ sub: inactive.id, role: inactive.role }, jwtSettings);
        const rr = await runMiddleware(mw, { headers: { authorization: `Bearer ${tk}` } });
        check('nofaol foydalanuvchi → 401', rr.err?.statusCode === 401);
      } else console.log('  – nofaol foydalanuvchi yo\'q, tekshiruv o\'tkazilmadi');

      // MAVJUD BO'LMAGAN foydalanuvchi (eskirgan token)
      const ghost = signAccess({ sub: 'a'.repeat(24), role: 'owner' }, jwtSettings);
      r = await runMiddleware(mw, { headers: { authorization: `Bearer ${ghost}` } });
      check('eskirgan kontekst (o\'chirilgan odam) → 401', r.err?.statusCode === 401);

      // BRANCH INTENT — mutatsiyada mos kelmasa 409
      const token2 = signAccess({ sub: owner.id, role: owner.role }, jwtSettings);
      r = await runMiddleware(mw, {
        method: 'POST',
        headers: { authorization: `Bearer ${token2}`, 'x-branch-context': 'DEFINITELY_WRONG' },
      });
      check('branch intent mos emas (POST) → 409', r.err?.statusCode === 409);
      r = await runMiddleware(mw, {
        method: 'GET',
        headers: { authorization: `Bearer ${token2}`, 'x-branch-context': 'DEFINITELY_WRONG' },
      });
      check('branch intent O\'QISHDA e\'tiborsiz (GET) → xato yo\'q', !r.err);

      // x-branch-id: KO'LAMDAN TASHQARI QIYMAT E'TIBORSIZ QOLDIRILADI (403 EMAS)
      r = await runMiddleware(mw, {
        headers: { authorization: `Bearer ${token2}`, 'x-branch-id': 'f'.repeat(24) },
      });
      check('ko\'lamdan tashqari x-branch-id → e\'tiborsiz, 403 EMAS', !r.err);
    }

    // ─── 5. QO'RIQCHILAR ─────────────────────────────────────────────
    console.log('\n\x1b[1m  Qo\'riqchilar\x1b[0m');
    const ctxFor = (req, handlerMeta) => {
      const handler = () => {};
      if (handlerMeta) Reflect.defineMetadata(handlerMeta.key, handlerMeta.value, handler);
      return {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => handler,
        getClass: () => class {},
      };
    };
    const pg = new PermissionsGuard(reflector);
    const rg = new RolesGuard(reflector);
    const psg = new PermissionOrSelfGuard(reflector);

    check('PermissionsGuard: dekoratorsiz → o\'tadi',
      pg.canActivate(ctxFor({ user: {}, permissions: [] })) === true);
    check('PermissionsGuard: ruxsat bor → o\'tadi',
      pg.canActivate(ctxFor({ user: {}, permissions: ['users.read'] },
        { key: 'permissions', value: [PERMISSIONS.USERS_READ] })) === true);
    check('PermissionsGuard: ruxsat yo\'q → 403',
      t(() => pg.canActivate(ctxFor({ user: {}, permissions: [] },
        { key: 'permissions', value: [PERMISSIONS.USERS_READ] })))?.statusCode === 403);
    check('PermissionsGuard: autentifikatsiyasiz → 401',
      t(() => pg.canActivate(ctxFor({ permissions: [] },
        { key: 'permissions', value: [PERMISSIONS.USERS_READ] })))?.statusCode === 401);
    check('RolesGuard: roleType bo\'yicha custom rol o\'tadi',
      rg.canActivate(ctxFor({ user: { role: 'senior_teacher' }, role: { roleType: 'teacher' }, permissions: [] },
        { key: 'roles', value: ['teacher'] })) === true);
    check('RolesGuard: owner-only + system.admin_access → o\'tadi',
      rg.canActivate(ctxFor({ user: { role: 'custom' }, role: { roleType: 'staff' },
        permissions: [PERMISSIONS.SYSTEM_ADMIN_ACCESS] }, { key: 'roles', value: [ROLES.OWNER] })) === true);
    check('RolesGuard: mos kelmasa → 403',
      t(() => rg.canActivate(ctxFor({ user: { role: 'x' }, role: { roleType: 'staff' }, permissions: [] },
        { key: 'roles', value: [ROLES.OWNER] })))?.statusCode === 403);
    check('PermissionOrSelfGuard: o\'quvchi O\'ZINI o\'qiydi → o\'tadi',
      psg.canActivate(ctxFor({ user: { id: 'S1', role: 'student' }, role: { roleType: 'student' },
        permissions: [], params: { id: 'S1' } },
        { key: 'permission_or_self', value: { key: 'users.read', param: 'id', source: 'params' } })) === true);
    check('PermissionOrSelfGuard: o\'quvchi BOSHQANI o\'qiydi → 403',
      t(() => psg.canActivate(ctxFor({ user: { id: 'S1', role: 'student' }, role: { roleType: 'student' },
        permissions: [], params: { id: 'S2' } },
        { key: 'permission_or_self', value: { key: 'users.read', param: 'id', source: 'params' } })))?.statusCode === 403);

    // ─── 6. SAQLANGAN XATTI-HARAKATLAR ───────────────────────────────
    console.log('\n\x1b[1m  Saqlangan xatti-harakatlar\x1b[0m');
    check('parol OCHIQ MATN (loyiha talabi)', (await hashPassword('abc')) === 'abc');
    check('parol solishtiruvi matn tengligi',
      (await comparePassword('abc', 'abc')) && !(await comparePassword('abc', 'x')));
    const aliased = withLegacyId({ id: '1', nested: { id: '2' }, list: [{ id: '3' }] });
    check('withLegacyId CHUQUR _id qo\'shadi',
      aliased._id === '1' && aliased.nested._id === '2' && aliased.list[0]._id === '3');
    const d = new Date();
    check('withLegacyId Date obyektini BUZMAYDI',
      withLegacyId({ id: '1', at: d }).at instanceof Date);
    const ownerRole = await perms.resolveRole(ROLES.OWNER);
    check('resolveRole(owner) → ["*"] va muzlatilmagan',
      ownerRole.permissions.includes('*') && ownerRole.isFrozen === false);
    const missing = await perms.resolveRole('__no_such_role__');
    check('mavjud bo\'lmagan rol → bo\'sh ruxsat (fail-closed)',
      missing.exists === false && missing.permissions.length === 0);
    check('isMultiBranch bazadan aniqlanadi', typeof (await branchAccess.isMultiBranch()) === 'boolean');
    check('ApiError statusCode/code saqlaydi', (() => {
      const e = new ApiError(409, 'x', { code: 'C', details: { a: 1 } });
      return e.statusCode === 409 && e.code === 'C' && e.details.a === 1;
    })());
  } finally {
    await app.close();
  }

  console.log(`\n  Natija: ${R.pass} o'tdi, ${R.fail} yiqildi\n`);
  process.exit(R.fail ? 1 : 0);
};

run().catch((e) => { console.error('Test xatosi:', e); process.exit(1); });
