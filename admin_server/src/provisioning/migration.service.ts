import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Tenant, Vps } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SshService } from '../vps/ssh.service.js';
import { decryptSecret } from '../common/crypto/secrets.util.js';
import { ProvisioningService } from './provisioning.service.js';
import { DeploymentsService, type DeploymentHandle } from './deployments.service.js';
import { ScriptRunnerService } from './script-runner.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENANTNI BOSHQA VPS'GA KO'CHIRISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ASOSIY QOIDA: MANBA HECH QACHON AVTOMATIK O'CHIRILMAYDI ──
 *
 * Ko'chirish MUVAFFAQIYATLI tugasa ham eski VPS'dagi papka, baza va
 * nginx vhost JOYIDA QOLADI — faqat pm2 jarayoni to'xtatiladi (ikkita
 * tirik nusxa bir bazaga yozmasin). O'chirish ALOHIDA, oshkora amal
 * (`decommissionSource`). Sabab: ko'chirishdan keyingi soatlarda
 * muammo chiqsa (DNS keshi, yo'qolgan fayl, migratsiya nomutanosibligi),
 * eski nusxa yagona qaytish yo'li bo'ladi. Uni avtomatik o'chirish —
 * zaxirasiz operatsiya.
 *
 * ── QADAMLAR ──
 *
 *   1  PREFLIGHT   ikkala VPS tirikmi, nishonda port/domen bandmi,
 *                  manbada baza va papka bormi
 *   2  DUMP        manbada `pg_dump -Fc` → admin_server diskiga oqim
 *   3  UPLOADS     manbada `tar czf -` → admin_server diskiga oqim
 *   4  PROVISION   nishonda `provision.sh` (kod, .env, baza, migratsiya,
 *                  pm2, nginx). Bu bosqichda tenant HALI eski VPS'da ishlaydi.
 *   5  RESTORE     dump nishondagi bazaga `pg_restore --clean --if-exists`
 *                  (migratsiya holati ham dump ichida — nomutanosiblik yo'q)
 *   6  UPLOADS↑    fayllar nishonga yoziladi
 *   7  VERIFY      nishonda pm2 tirik va `/api/health` javob beradi;
 *                  baza ichida `users` jadvali va yozuvlar soni mos
 *   8  SWITCH      `Tenant.vpsId` va `serverIp` yangilanadi — DNS shu
 *                  yerdan o'qiladi. Bu YAGONA "orqaga qaytmas" qadam.
 *   9  STOP SOURCE eski VPS'da `pm2 stop` (o'chirish EMAS)
 *
 * Har qadam `Deployment.meta.step` ga yoziladi: yiqilsa panel AYNAN
 * qaysi bosqichda to'xtaganini ko'rsatadi va operator qo'lda davom
 * ettira oladi.
 *
 * ── XATO BO'LSA ──
 * 1–7 orasida yiqilsa `Tenant.vpsId` TEGILMAYDI: tenant eski VPS'da
 * ishlashda davom etadi va foydalanuvchi hech narsa sezmaydi. Nishonda
 * yarim qurilgan nusxa qoladi — u keyingi urinishda ustiga yoziladi
 * (`provision.sh` papkani tozalaydi) yoki qo'lda o'chiriladi.
 */

const shq = (v: string) => `'${String(v).replace(/'/g, `'\\''`)}'`;

/** Ko'chirish bosqichlari — `Deployment.meta.step` uchun. */
export type MigrationStep =
  | 'preflight'
  | 'dump'
  | 'uploads-pull'
  | 'provision'
  | 'restore'
  | 'uploads-push'
  | 'verify'
  | 'switch'
  | 'stop-source'
  | 'done';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger('Migration');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: SshService,
    private readonly runner: ScriptRunnerService,
    private readonly provisioning: ProvisioningService,
    private readonly deployments: DeploymentsService,
  ) {}

  private pgBase(vps: Vps): string {
    return (
      vps.postgresBaseUrl ? decryptSecret(vps.postgresBaseUrl) : 'postgresql://postgres:postgres@127.0.0.1:5432'
    ).replace(/\/+$/, '');
  }

  private appDir(vps: Vps, dbName: string): string {
    return path.posix.join(vps.rootDir.replace(/\/+$/, ''), 'tenants', dbName);
  }

  /**
   * Ko'chirishni boshlaydi. Uzoq davom etadi (bir necha daqiqadan
   * yarim soatgacha) — chaqiruvchi FON rejimida ishga tushiradi va
   * holatni `Deployment` yozuvidan kuzatadi.
   */
  async migrate(input: {
    tenantId: string;
    targetVpsId: string;
    startedBy?: string | null;
  }): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const source = tenant.vps;
    if (!source) throw new BadRequestException("Tenant hech qaysi VPS'ga biriktirilmagan — ko'chirish uchun manba yo'q");
    if (source.id === input.targetVpsId) throw new BadRequestException('Nishon VPS manba bilan bir xil');

    const target = await this.prisma.vps.findUnique({
      where: { id: input.targetVpsId },
      include: { _count: { select: { tenants: true } } },
    });
    if (!target) throw new NotFoundException('Nishon VPS topilmadi');
    if (!target.isActive) throw new BadRequestException(`Nishon VPS "${target.name}" deaktivatsiya qilingan`);
    if (target.maxTenants != null && target._count.tenants >= target.maxTenants) {
      throw new BadRequestException(`Nishon VPS to'lgan (${target._count.tenants}/${target.maxTenants})`);
    }
    if (!['ACTIVE', 'SUSPENDED', 'FAILED'].includes(tenant.status)) {
      throw new ConflictException(`Tenant holati "${tenant.status}" — ko'chirish faqat ACTIVE/SUSPENDED/FAILED da mumkin`);
    }
    if (await this.deployments.running(tenant.id)) {
      throw new ConflictException('Bu tenantda boshqa deploy ishlayapti — tugashini kuting');
    }

    const handle = await this.deployments.start({
      tenantId: tenant.id,
      // Jurnal NISHON VPS'ga yoziladi: amal "u yerga ko'chirish".
      vpsId: target.id,
      kind: 'MIGRATE',
      startedBy: input.startedBy,
      meta: { sourceVpsId: source.id, targetVpsId: target.id, step: 'preflight' as MigrationStep },
    });

    const step = async (s: MigrationStep) => {
      handle.log(`\n━━━ ${s.toUpperCase()} ━━━\n`);
      await handle.setMeta({ sourceVpsId: source.id, targetVpsId: target.id, step: s });
    };

    let workDir: string | null = null;
    try {
      workDir = await mkdtemp(path.join(tmpdir(), `mig-${tenant.dbName}-`));
      await this.run(tenant, source, target as Vps, handle, step, workDir);

      await handle.finish({
        code: 0,
        meta: { sourceVpsId: source.id, targetVpsId: target.id, step: 'done' as MigrationStep },
      });
      this.logger.log(`Ko'chirish tugadi: ${tenant.domain} → ${target.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      handle.log(`\n❌ ${message}\n`);
      handle.log(
        `\nTenant ESKI VPS'da ("${source.name}") ishlashda davom etmoqda — routing o'zgartirilmadi.\n`,
      );
      await handle.fail(message);
      this.logger.error(`Ko'chirish yiqildi: ${tenant.domain} — ${message}`);
    } finally {
      if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // ── Bosqichlar ─────────────────────────────────────────────────────────

  private async run(
    tenant: Tenant,
    source: Vps,
    target: Vps,
    handle: DeploymentHandle,
    step: (s: MigrationStep) => Promise<void>,
    workDir: string,
  ): Promise<void> {
    const log = handle.log;

    // ── 1) PREFLIGHT ─────────────────────────────────────────────────
    await step('preflight');
    log(`Manba:  ${source.name} (${source.isLocal ? 'lokal' : source.host})\n`);
    log(`Nishon: ${target.name} (${target.isLocal ? 'lokal' : target.host})\n`);

    const srcApp = this.appDir(source, tenant.dbName);
    const srcCheck = await this.ssh.exec(
      source,
      `test -d ${shq(srcApp)} && echo APP_OK; psql ${shq(`${this.pgBase(source)}/postgres`)} -tAc ${shq(`SELECT 1 FROM pg_database WHERE datname='${tenant.dbName}'`)}`,
      { timeoutMs: 60_000 },
    );
    if (!srcCheck.stdout.includes('APP_OK')) {
      throw new Error(`Manbada tenant papkasi topilmadi: ${srcApp}`);
    }
    if (!srcCheck.stdout.includes('1')) {
      throw new Error(`Manbada baza topilmadi: ${tenant.dbName}`);
    }
    log(`✓ Manbada papka va baza mavjud\n`);

    const tgtCheck = await this.ssh.exec(
      target,
      `psql ${shq(`${this.pgBase(target)}/postgres`)} -tAc ${shq(`SELECT 1 FROM pg_database WHERE datname='${tenant.dbName}'`)} ; ss -ltn 2>/dev/null | grep -c ${shq(`:${tenant.port} `)} || true`,
      { timeoutMs: 60_000 },
    );
    if (tgtCheck.code === 255) throw new Error(`Nishon VPS'ga ulanib bo'lmadi: ${tgtCheck.stderr.trim().split('\n').pop()}`);
    log(`✓ Nishon VPS javob berdi\n`);

    // ── 2) DUMP ──────────────────────────────────────────────────────
    await step('dump');
    const dumpPath = path.join(workDir, 'db.dump');
    log(`pg_dump: ${tenant.dbName} → admin_server\n`);
    const dumpBytes = await this.pullToFile(
      source,
      `pg_dump -Fc --no-owner --no-acl ${shq(`${this.pgBase(source)}/${tenant.dbName}`)}`,
      dumpPath,
      30 * 60_000,
    );
    if (dumpBytes < 1024) throw new Error(`pg_dump bo'sh chiqdi (${dumpBytes} bayt) — manba bazasi o'qilmadi`);
    log(`✓ Dump: ${(dumpBytes / 1024 / 1024).toFixed(1)} MB\n`);

    // ── 3) UPLOADS (manbadan) ────────────────────────────────────────
    await step('uploads-pull');
    const uploadsPath = path.join(workDir, 'uploads.tgz');
    const upDir = path.posix.join(srcApp, 'server', 'uploads');
    const hasUploads = await this.ssh.exec(source, `test -d ${shq(upDir)} && echo YES || echo NO`, { timeoutMs: 30_000 });
    let uploadBytes = 0;
    if (hasUploads.stdout.includes('YES')) {
      uploadBytes = await this.pullToFile(source, `tar czf - -C ${shq(upDir)} .`, uploadsPath, 30 * 60_000);
      log(`✓ Fayllar: ${(uploadBytes / 1024 / 1024).toFixed(1)} MB\n`);
    } else {
      log(`• Yuklangan fayllar papkasi yo'q — o'tkazib yuborildi\n`);
    }

    // ── 4) PROVISION (nishonda) ──────────────────────────────────────
    //
    // ⚠ Tenant HALI eski VPS'da ishlaydi. Bu bosqich nishonda kod, .env,
    // bo'sh baza, migratsiya, pm2 va nginx yaratadi — mijozga ta'siri yo'q.
    await step('provision');
    const { tenant: fresh, template, fileEnv } = await this.provisioning.buildFileEnv(tenant.id);
    if (!template) throw new Error('Tizim shabloni topilmadi');

    const { code: provCode } = await this.runner.run(
      target,
      'provision.sh',
      {
        ...this.provisioning.baseEnv(fresh, template.templateDir),
        ...fileEnv,
        // Repo push'i ko'chirishda KERAK EMAS: kod allaqachon repoda va
        // ikkinchi push tarixni chalkashtirardi.
        GIT_ENABLED: 'false',
        GIT_REMOTE: '',
        GIT_TOKEN: '',
        GIT_BRANCH: 'main',
      },
      log,
    );
    if (provCode !== 0) throw new Error(`Nishonda provision.sh yiqildi (kod ${provCode})`);
    log(`✓ Nishonda o'rnatma tayyor\n`);

    // ── 5) RESTORE ───────────────────────────────────────────────────
    //
    // Nishonda pm2 ishlab turibdi va bazaga ulangan — restore paytida
    // ulanishlar dump bilan to'qnashmasligi uchun avval TO'XTATAMIZ.
    await step('restore');
    await this.ssh.exec(target, `pm2 stop ${shq(tenant.pm2Name)} >/dev/null 2>&1 || true`, { timeoutMs: 60_000 });
    log(`• Nishonda pm2 vaqtincha to'xtatildi\n`);

    const restore = await this.pushFromFile(
      target,
      dumpPath,
      // `--clean --if-exists`: provision yaratgan bo'sh sxema (migratsiya
      // jadvali bilan birga) tashlanadi va dump'dagi holat tiklanadi.
      // `-e` YO'Q: ba'zi `DROP ... IF EXISTS` ogohlantirishlari normal.
      `pg_restore --clean --if-exists --no-owner --no-acl -d ${shq(`${this.pgBase(target)}/${tenant.dbName}`)}`,
      30 * 60_000,
    );
    if (restore.code !== 0) {
      log(restore.stderr.slice(-4000));
      throw new Error(`pg_restore yiqildi (kod ${restore.code})`);
    }
    log(`✓ Baza tiklandi\n`);

    // ── 6) UPLOADS (nishonga) ────────────────────────────────────────
    if (uploadBytes > 0) {
      await step('uploads-push');
      const tgtUp = path.posix.join(this.appDir(target, tenant.dbName), 'server', 'uploads');
      const r = await this.pushFromFile(
        target,
        uploadsPath,
        `mkdir -p ${shq(tgtUp)} && tar xzf - -C ${shq(tgtUp)}`,
        30 * 60_000,
      );
      if (r.code !== 0) throw new Error(`Fayllarni ko'chirib bo'lmadi: ${r.stderr.slice(-500)}`);
      log(`✓ Fayllar joylandi\n`);
    }

    // ── 7) VERIFY ────────────────────────────────────────────────────
    await step('verify');
    await this.ssh.exec(target, `pm2 restart ${shq(tenant.pm2Name)} --update-env >/dev/null 2>&1 || pm2 start ${shq(tenant.pm2Name)} >/dev/null 2>&1 || true`, {
      timeoutMs: 120_000,
    });
    // pm2 ko'tarilishi uchun vaqt — health darhol javob bermaydi.
    const verify = await this.ssh.exec(
      target,
      [
        `for i in $(seq 1 20); do`,
        `  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:${tenant.port}/api/health || echo 000)`,
        `  [ "$code" = "200" ] && { echo "HEALTH_OK"; break; }`,
        `  sleep 3`,
        `done`,
        `echo "PM2=$(pm2 jlist 2>/dev/null | grep -c ${shq(`"name":"${tenant.pm2Name}"`)} || echo 0)"`,
        `echo "USERS=$(psql ${shq(`${this.pgBase(target)}/${tenant.dbName}`)} -tAc 'SELECT count(*) FROM public.users' 2>/dev/null || echo ERR)"`,
      ].join('\n'),
      { timeoutMs: 180_000, onData: (c) => log(c) },
    );
    if (!verify.stdout.includes('HEALTH_OK')) {
      throw new Error("Nishonda /api/health 200 qaytarmadi — ko'chirish to'xtatildi (routing o'zgarmadi)");
    }
    const users = verify.stdout.match(/USERS=(\d+)/)?.[1];
    if (!users || Number(users) === 0) {
      throw new Error(`Nishon bazasida foydalanuvchi topilmadi (USERS=${users ?? 'ERR'}) — restore to'liq emas`);
    }
    log(`✓ Nishon sog'lom: health 200, ${users} ta foydalanuvchi\n`);

    // ── 8) SWITCH ────────────────────────────────────────────────────
    //
    // Yagona orqaga qaytmas qadam. Bir tranzaksiyada: routing manbai
    // (`vpsId`) va DNS uchun IP (`serverIp`) birga o'zgaradi — yarim
    // holat bo'lmasin.
    await step('switch');
    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { vpsId: target.id, serverIp: target.host, status: 'ACTIVE', failureReason: null },
      }),
    ]);
    log(`✓ Routing yangilandi: ${target.name} (${target.host})\n`);
    log(`⚠ DNS: "${tenant.domain}" A record ni ${target.host} ga o'zgartiring.\n`);

    // ── 9) STOP SOURCE ───────────────────────────────────────────────
    //
    // O'CHIRISH EMAS — faqat pm2 stop. Ikkita tirik nusxa bir bazaga
    // yozmasligi kerak; qolgan resurslar qaytish yo'li sifatida qoladi.
    await step('stop-source');
    const stop = await this.ssh.exec(source, `pm2 stop ${shq(tenant.pm2Name)} 2>&1 || true`, { timeoutMs: 120_000 });
    log(stop.stdout);
    log(`✓ Eski VPS'da pm2 to'xtatildi (papka, baza va nginx JOYIDA qoldi)\n`);
    log(`\nEski nusxani o'chirish uchun: "Manbani tozalash" tugmasi (alohida, oshkora amal).\n`);
  }

  // ── Oqim yordamchilari ─────────────────────────────────────────────────

  /** Masofadagi buyruq stdout'ini lokal faylga oqim bilan yozadi. */
  private async pullToFile(vps: Vps, command: string, destPath: string, timeoutMs: number): Promise<number> {
    const { createWriteStream } = await import('node:fs');
    const out = createWriteStream(destPath);
    const r = await this.ssh.exec(vps, command, {
      timeoutMs,
      onData: (chunk, stream) => {
        if (stream === 'stdout') out.write(Buffer.from(chunk, 'binary'));
      },
    });
    await new Promise<void>((res) => out.end(res));
    if (r.code !== 0) throw new Error(`Manbada buyruq yiqildi (kod ${r.code}): ${r.stderr.slice(-500)}`);
    const st = await stat(destPath);
    return st.size;
  }

  /** Lokal faylni masofadagi buyruqning stdin'iga uzatadi. */
  private async pushFromFile(vps: Vps, srcPath: string, command: string, timeoutMs: number) {
    const chunks: Buffer[] = [];
    for await (const c of createReadStream(srcPath)) chunks.push(c as Buffer);
    return this.ssh.exec(vps, command, { stdin: Buffer.concat(chunks).toString('binary'), timeoutMs });
  }

  // ── Manbani tozalash (alohida amal) ────────────────────────────────────

  /**
   * Ko'chirishdan keyin ESKI VPS'dagi nusxani o'chiradi.
   *
   * ⚠ ALOHIDA VA OSHKORA. Ko'chirish buni O'ZI QILMAYDI. Bu yerda ham
   * ikki himoya bor: (1) tenant hozir BOSHQA VPS'da bo'lishi shart,
   * (2) domen qo'lda tasdiqlanadi — noto'g'ri tenantni tozalab
   * yubormaslik uchun.
   */
  async decommissionSource(input: {
    tenantId: string;
    sourceVpsId: string;
    confirmDomain: string;
    startedBy?: string | null;
  }): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');
    if (input.confirmDomain !== tenant.domain) {
      throw new BadRequestException(`Tasdiqlash uchun domenni aynan yozing: ${tenant.domain}`);
    }
    if (tenant.vpsId === input.sourceVpsId) {
      throw new ConflictException(
        "Tenant AYNAN shu VPS'da ishlayapti — tozalash uni o'chirib qo'yardi. Avval boshqa serverga ko'chiring.",
      );
    }
    const source = await this.prisma.vps.findUnique({ where: { id: input.sourceVpsId } });
    if (!source) throw new NotFoundException('Manba VPS topilmadi');

    const handle = await this.deployments.start({
      tenantId: tenant.id,
      vpsId: source.id,
      kind: 'DECOMMISSION_SOURCE',
      startedBy: input.startedBy,
      meta: { sourceVpsId: source.id },
    });

    handle.log(`==> Eski nusxa tozalanmoqda: ${source.name} (${source.host})\n`);
    const { code } = await this.runner.run(
      source,
      'deprovision.sh',
      {
        TENANT_DB_NAME: tenant.dbName,
        TENANT_DOMAIN: tenant.domain,
        TENANT_PM2_NAME: tenant.pm2Name,
      },
      handle.log,
    );
    await handle.finish({ code });
    this.logger.warn(`Eski nusxa tozalandi: ${tenant.domain} @ ${source.name} (kod ${code})`);
  }
}
