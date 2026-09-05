import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Vps } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { decryptSecret, encryptSecret, isEncryptionConfigured } from '../common/crypto/secrets.util.js';
import { SshService } from './ssh.service.js';
import type { CreateVpsDto, UpdateVpsDto } from './dto/vps.dto.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VPS BOSHQARUVI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── SIR HECH QACHON QAYTARILMAYDI ──
 * `sanitize()` har bir javobdan `sshPrivateKey`/`sshPassword` ni olib
 * tashlaydi va o'rniga `hasKey`/`hasPassword` bayroqlari + barmoq izini
 * qo'yadi. Servisning BIRORTA ommaviy metodi xom `Vps` qaytarmaydi —
 * `findRaw()` bundan mustasno va u faqat SSH bajaruvchi (script-runner)
 * uchun, kontrollerga ulanmagan.
 *
 * ── SHIFRLASH MAJBURIY ──
 * `SETTINGS_ENCRYPTION_KEY` yo'q bo'lsa kalit SAQLANMAYDI (400). Ochiq
 * saqlash "vaqtinchalik" ham bo'lmaydi — tenant `.env` sirlari bilan
 * bir xil qoida.
 */

/**
 * API qaytaradigan shakl — SIRSIZ.
 *
 * ⚠ `postgresBaseUrl` HAM OLIB TASHLANADI: u `postgresql://user:PAROL@host`
 * ko'rinishida bo'lib, ichida bazaning paroli turadi. U `sshPrivateKey`
 * bilan bir toifada — javobda faqat "sozlanganmi" bayrog'i va parolsiz
 * ko'rinishi (`postgresHost`) qoladi.
 */
export type SafeVps = Omit<Vps, 'sshPrivateKey' | 'sshPassword' | 'postgresBaseUrl'> & {
  hasKey: boolean;
  hasPassword: boolean;
  /** Postgres URL'i sozlanganmi (standart emasmi). */
  hasPostgresUrl: boolean;
  /** Parolsiz ko'rinish: `user@host:port` — UI'da tekshirish uchun. */
  postgresHost: string | null;
  tenantCount?: number;
};

/**
 * Ulanish testi buyrug'i. Hamma qator `KEY=VALUE`, bittasi yiqilsa
 * qolgani chiqaveradi (`|| echo`). Natija `parseProbe` da o'qiladi.
 */
const PROBE_SCRIPT = `
set +e
echo "OS=$(uname -srm 2>/dev/null || echo unknown)"
echo "HOSTNAME=$(hostname 2>/dev/null || echo unknown)"
echo "CPU=$(nproc 2>/dev/null || echo 0)"
echo "MEM_TOTAL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo 0)"
echo "MEM_FREE_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}' || echo 0)"
echo "DISK_TOTAL_GB=$(df -BG / 2>/dev/null | awk 'NR==2{gsub("G","",$2);print $2}' || echo 0)"
echo "DISK_FREE_GB=$(df -BG / 2>/dev/null | awk 'NR==2{gsub("G","",$4);print $4}' || echo 0)"
echo "LOAD1=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo 0)"
echo "NODE=$(node -v 2>/dev/null || echo missing)"
echo "NPM=$(npm -v 2>/dev/null || echo missing)"
echo "PM2=$(pm2 -v 2>/dev/null | tail -1 || echo missing)"
echo "NGINX=$(nginx -v 2>&1 | sed 's#nginx version: ##' || echo missing)"
echo "PSQL=$(psql --version 2>/dev/null | awk '{print $3}' || echo missing)"
echo "CERTBOT=$(certbot --version 2>&1 | awk '{print $2}' || echo missing)"
echo "GIT=$(git --version 2>/dev/null | awk '{print $3}' || echo missing)"
echo "WHOAMI=$(whoami 2>/dev/null || echo unknown)"
`;

/** Deploy uchun SHART bo'lgan vositalar — yo'q bo'lsa status ERROR. */
const REQUIRED_TOOLS = ['NODE', 'NPM', 'PM2', 'NGINX', 'PSQL', 'GIT'] as const;

@Injectable()
export class VpsService {
  private readonly logger = new Logger('VPS');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: SshService,
  ) {}

  // ── Ko'rsatish ─────────────────────────────────────────────────────────

  sanitize(v: Vps & { _count?: { tenants: number } }): SafeVps {
    const { sshPrivateKey, sshPassword, postgresBaseUrl, _count, ...rest } = v;
    return {
      ...rest,
      hasKey: Boolean(sshPrivateKey),
      hasPassword: Boolean(sshPassword),
      hasPostgresUrl: Boolean(postgresBaseUrl),
      postgresHost: this.postgresHostOf(postgresBaseUrl),
      ...(typeof _count?.tenants === 'number' ? { tenantCount: _count.tenants } : {}),
    };
  }

  /**
   * `postgresql://user:parol@host:port` → `user@host:port`.
   * Parol HECH QACHON qaytmaydi; xato bo'lsa `null` (yolg'on qiymat emas).
   */
  private postgresHostOf(stored: string | null): string | null {
    if (!stored) return null;
    try {
      const u = new URL(decryptSecret(stored));
      return `${u.username || 'postgres'}@${u.hostname}:${u.port || '5432'}`;
    } catch {
      return null;
    }
  }

  async findAll(): Promise<SafeVps[]> {
    const rows = await this.prisma.vps.findMany({
      orderBy: [{ isLocal: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { tenants: true } } },
    });
    return rows.map((r) => this.sanitize(r));
  }

  async findOne(id: string) {
    const v = await this.prisma.vps.findUnique({
      where: { id },
      include: {
        _count: { select: { tenants: true } },
        tenants: {
          select: { id: true, name: true, domain: true, status: true, port: true, pm2Name: true, lastHeartbeatAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!v) throw new NotFoundException('VPS topilmadi');
    const { tenants, ...rest } = v;
    return { ...this.sanitize(rest), tenants };
  }

  /**
   * XOM yozuv — sirlar bilan. FAQAT SSH bajaruvchi uchun; kontrollerga
   * ulanmasin.
   */
  async findRaw(id: string): Promise<Vps> {
    const v = await this.prisma.vps.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('VPS topilmadi');
    return v;
  }

  /** Standart VPS — yangi tenant uchun: lokal bo'lsa u, aks holda birinchi faol. */
  async defaultVpsId(): Promise<string | null> {
    const v = await this.prisma.vps.findFirst({
      where: { isActive: true },
      orderBy: [{ isLocal: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return v?.id ?? null;
  }

  // ── Yozish ─────────────────────────────────────────────────────────────

  private prepareSecrets(dto: {
    authMethod?: string;
    sshPrivateKey?: string;
    sshPassword?: string;
    postgresBaseUrl?: string;
    isLocal?: boolean;
  }) {
    const data: Prisma.VpsUpdateInput = {};
    if (dto.sshPrivateKey) {
      if (!isEncryptionConfigured()) {
        throw new BadRequestException(
          "SETTINGS_ENCRYPTION_KEY sozlanmagan — SSH kalit shifrlanmasdan saqlanmaydi",
        );
      }
      const problem = this.ssh.validatePrivateKey(dto.sshPrivateKey);
      if (problem) throw new BadRequestException(`SSH kalit yaroqsiz: ${problem}`);
      data.sshPrivateKey = encryptSecret(dto.sshPrivateKey);
      data.sshKeyFingerprint = this.ssh.fingerprintOf(dto.sshPrivateKey);
    }
    if (dto.sshPassword) {
      if (!isEncryptionConfigured()) {
        throw new BadRequestException("SETTINGS_ENCRYPTION_KEY sozlanmagan — parol shifrlanmasdan saqlanmaydi");
      }
      data.sshPassword = encryptSecret(dto.sshPassword);
    }
    if (dto.postgresBaseUrl) {
      // ⚠ URL ichida PAROL bor — shu sababli u ham sir sifatida
      // shifrlanadi va javobda hech qachon qaytmaydi.
      if (!isEncryptionConfigured()) {
        throw new BadRequestException(
          'SETTINGS_ENCRYPTION_KEY sozlanmagan — Postgres URL shifrlanmasdan saqlanmaydi',
        );
      }
      let parsed: URL;
      try {
        parsed = new URL(dto.postgresBaseUrl);
      } catch {
        throw new BadRequestException(
          'Postgres URL yaroqsiz. Namuna: postgresql://postgres:parol@127.0.0.1:5432',
        );
      }
      if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
        throw new BadRequestException("Postgres URL `postgresql://` bilan boshlanishi kerak");
      }
      // Oxiridagi `/` va baza nomi KESILADI: bu BAZAVIY url, tenant
      // bazasi nomi unga har safar qo'shiladi. Baza nomi qolib ketsa
      // DSN `.../postgres/tenant_db` bo'lib buzilardi.
      parsed.pathname = '';
      data.postgresBaseUrl = encryptSecret(parsed.toString().replace(/\/+$/, ''));
    }
    return data;
  }

  async create(dto: CreateVpsDto, createdBy?: string): Promise<SafeVps> {
    // Masofaviy VPS uchun kirish ma'lumoti SHART. Lokal uchun kerak emas.
    if (!dto.isLocal) {
      const method = dto.authMethod ?? 'SSH_KEY';
      if (method === 'SSH_KEY' && !dto.sshPrivateKey) {
        throw new BadRequestException('SSH kalit kiritilmadi (yoki authMethod=PASSWORD tanlang)');
      }
      if (method === 'PASSWORD' && !dto.sshPassword) {
        throw new BadRequestException('SSH parol kiritilmadi');
      }
    }
    if (dto.isLocal) {
      const existingLocal = await this.prisma.vps.findFirst({ where: { isLocal: true } });
      if (existingLocal) {
        throw new ConflictException(`Lokal VPS allaqachon bor: "${existingLocal.name}" — admin_server bitta mashinada turadi`);
      }
    }

    const secrets = this.prepareSecrets(dto);
    const created = await this.prisma.vps.create({
      data: {
        // Sirlar BIRINCHI: keyingi aniq maydonlar ustun turadi (TS2783).
        ...(secrets as Prisma.VpsCreateInput),
        name: dto.name,
        host: dto.host,
        sshPort: dto.sshPort ?? 22,
        sshUser: dto.sshUser ?? 'root',
        authMethod: dto.authMethod ?? 'SSH_KEY',
        rootDir: dto.rootDir ?? '/root',
        isLocal: dto.isLocal ?? false,
        maxTenants: dto.maxTenants ?? null,
        notes: dto.notes ?? null,
        createdBy: createdBy ?? null,
      },
    });
    this.logger.log(`VPS yaratildi: ${created.name} (${created.host}) — ${createdBy ?? 'noma\'lum'}`);
    return this.sanitize(created);
  }

  async update(id: string, dto: UpdateVpsDto): Promise<SafeVps> {
    const existing = await this.findRaw(id);
    if (dto.isLocal === true && !existing.isLocal) {
      const other = await this.prisma.vps.findFirst({ where: { isLocal: true, NOT: { id } } });
      if (other) throw new ConflictException(`Lokal VPS allaqachon bor: "${other.name}"`);
    }

    const { sshPrivateKey: _k, sshPassword: _p, postgresBaseUrl: _pg, clearSecrets, ...plain } = dto;
    const data: Prisma.VpsUpdateInput = { ...plain, ...this.prepareSecrets(dto) };
    if (clearSecrets) {
      data.sshPrivateKey = null;
      data.sshPassword = null;
      data.sshKeyFingerprint = null;
      // Postgres URL ham sir — "sirlarni tozalash" uni ham qamraydi.
      data.postgresBaseUrl = null;
    }
    // Ulanish ma'lumoti o'zgardi — oldingi test natijasi endi ishonchsiz.
    if (dto.host || dto.sshPort || dto.sshUser || dto.sshPrivateKey || dto.sshPassword || dto.authMethod || clearSecrets) {
      data.status = 'UNKNOWN';
      data.lastCheckError = null;
    }

    const updated = await this.prisma.vps.update({ where: { id }, data });
    return this.sanitize(updated);
  }

  /**
   * O'chirish — FAQAT tenantlari yo'q VPS. Tenantli VPS'ni yo'q qilish
   * ularni "hech qayerda" qoldirardi; buning o'rniga `isActive=false`
   * (yangi tenant tayinlanmaydi, mavjudlari ishlayveradi).
   */
  async remove(id: string): Promise<{ ok: true }> {
    const v = await this.prisma.vps.findUnique({
      where: { id },
      include: { _count: { select: { tenants: true } } },
    });
    if (!v) throw new NotFoundException('VPS topilmadi');
    if (v._count.tenants > 0) {
      throw new ConflictException(
        `Bu VPS'da ${v._count.tenants} ta tenant bor — avval ularni ko'chiring yoki VPS'ni deaktivatsiya qiling`,
      );
    }
    await this.prisma.vps.delete({ where: { id } });
    this.logger.warn(`VPS o'chirildi: ${v.name} (${v.host})`);
    return { ok: true };
  }

  // ── Ulanish testi ──────────────────────────────────────────────────────

  private parseProbe(stdout: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of stdout.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  }

  /**
   * Ulanadi, resurslarni o'qiydi, kerakli vositalarni tekshiradi, natijani
   * yozadi. Hech qachon tashlamaydi — natija `status` da.
   */
  async test(id: string) {
    const vps = await this.findRaw(id);
    const startedAt = Date.now();
    let status: Vps['status'] = 'ONLINE';
    let error: string | null = null;
    let resources: Prisma.InputJsonValue | null = null;
    let log = '';

    try {
      const r = await this.ssh.exec(vps, PROBE_SCRIPT, { timeoutMs: 60_000 });
      log = [r.stdout, r.stderr].filter(Boolean).join('\n--- stderr ---\n');
      if (r.code === 255 || (!r.stdout && r.code !== 0)) {
        status = 'OFFLINE';
        error = r.stderr.trim().split('\n').pop() || `Ulanib bo'lmadi (kod ${r.code})`;
      } else {
        const p = this.parseProbe(r.stdout);
        const missing = REQUIRED_TOOLS.filter((t) => !p[t] || p[t] === 'missing');
        resources = {
          os: p.OS ?? null,
          hostname: p.HOSTNAME ?? null,
          cpu: Number(p.CPU) || 0,
          memTotalMb: Number(p.MEM_TOTAL_MB) || 0,
          memFreeMb: Number(p.MEM_FREE_MB) || 0,
          diskTotalGb: Number(p.DISK_TOTAL_GB) || 0,
          diskFreeGb: Number(p.DISK_FREE_GB) || 0,
          load1: Number(p.LOAD1) || 0,
          user: p.WHOAMI ?? null,
          tools: {
            node: p.NODE ?? 'missing',
            npm: p.NPM ?? 'missing',
            pm2: p.PM2 ?? 'missing',
            nginx: p.NGINX ?? 'missing',
            psql: p.PSQL ?? 'missing',
            certbot: p.CERTBOT ?? 'missing',
            git: p.GIT ?? 'missing',
          },
          probeMs: Date.now() - startedAt,
        };
        if (missing.length) {
          status = 'ERROR';
          error = `Yetishmayotgan vositalar: ${missing.map((m) => m.toLowerCase()).join(', ')}`;
        }
      }
    } catch (err) {
      status = 'OFFLINE';
      error = err instanceof Error ? err.message : String(err);
    }

    const updated = await this.prisma.vps.update({
      where: { id },
      data: {
        status,
        lastCheckedAt: new Date(),
        lastCheckError: error,
        lastCheckLog: log.slice(-8000),
        ...(resources ? { resources } : {}),
      },
    });
    return this.sanitize(updated);
  }
}
