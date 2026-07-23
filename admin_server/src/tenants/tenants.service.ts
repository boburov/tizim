import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

const PORT_MIN = Number(process.env.TENANT_PORT_MIN || 5100);
const PORT_MAX = Number(process.env.TENANT_PORT_MAX || 5999);

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
  ) {}

  /** Nomdan xavfsiz slug hosil qiladi (DB nomi/pm2 nomi uchun asos). */
  private slugify(input: string): string {
    const base = input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return base || 'tenant';
  }

  /**
   * NOYOB DB nomi generatsiyasi — hech qachon takrorlanmaydi.
   * slug + qisqa tasodifiy suffiks; DB'da unique bo'lguncha qayta uriniladi.
   */
  private async generateUniqueDbName(name: string): Promise<string> {
    const slug = this.slugify(name);
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = randomBytes(4).toString('hex'); // 8 hex belgi
      const candidate = `tenant_${slug}_${suffix}`.replace(/-/g, '_');
      const exists = await this.prisma.tenant.findUnique({
        where: { dbName: candidate },
      });
      if (!exists) return candidate;
    }
    // Deyarli imkonsiz — 8 hex 4 mlrd variant
    throw new ConflictException("Noyob DB nomi hosil qilinmadi, qayta urining");
  }

  /** Bo'sh portni tanlaydi (diapazon ichida, band bo'lmaganini). */
  private async pickFreePort(): Promise<number> {
    const used = await this.prisma.tenant.findMany({ select: { port: true } });
    const usedSet = new Set(used.map((u) => u.port));
    for (let p = PORT_MIN; p <= PORT_MAX; p++) {
      if (!usedSet.has(p)) return p;
    }
    throw new ConflictException("Bo'sh port qolmadi");
  }

  async create(dto: CreateTenantDto, createdBy?: string) {
    // Domen bandligini tekshirish
    const domainTaken = await this.prisma.tenant.findUnique({
      where: { domain: dto.domain },
    });
    if (domainTaken) {
      throw new ConflictException('Bu domen allaqachon band');
    }

    // Tanlangan tizim mavjud va faolmi
    const template = await this.prisma.systemTemplate.findUnique({
      where: { id: dto.systemTemplateId },
    });
    if (!template || !template.isActive) {
      throw new BadRequestException("Tanlangan tizim mavjud emas yoki faol emas");
    }

    const dbName = await this.generateUniqueDbName(dto.name);
    const port = await this.pickFreePort();
    // pm2 nomi ham noyob bo'lishi kerak — dbName'dan olamiz (u allaqachon noyob)
    const pm2Name = `${dbName}-api`;

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        domain: dto.domain,
        brandColor: dto.brandColor,
        logoUrl: dto.logoUrl,
        botToken: dto.botToken,
        dbName,
        pm2Name,
        port,
        systemTemplateId: dto.systemTemplateId,
        status: 'DRAFT',
        createdBy,
        serverIp: process.env.SERVER_PUBLIC_IP || null,
      },
    });

    // Provisioning'ni fon rejimida boshlaymiz — javob darrov qaytadi
    this.provisioning
      .provision({
        tenantId: tenant.id,
        dbName: tenant.dbName,
        domain: tenant.domain,
        pm2Name: tenant.pm2Name,
        port: tenant.port,
        name: tenant.name,
        brandColor: tenant.brandColor,
        logoUrl: tenant.logoUrl,
        botToken: tenant.botToken,
        templateDir: template.templateDir,
      })
      .catch((err) =>
        this.logger.error(`Provisioning boshlashda xato: ${err.message}`),
      );

    return this.withDnsInfo(tenant);
  }

  /** DNS uchun kerakli IP va yo'riqnomani javobga qo'shadi. */
  private withDnsInfo(tenant: any) {
    const ip = tenant.serverIp || process.env.SERVER_PUBLIC_IP || null;
    return {
      ...tenant,
      dns: {
        // Cloudflare'ga qo'shiladigan A record
        recordType: 'A',
        name: tenant.domain,
        ip,
        note: ip
          ? `Cloudflare'da "${tenant.domain}" uchun A record → ${ip} qo'shing (proxy: DNS only tavsiya)`
          : "SERVER_PUBLIC_IP .env'da sozlanmagan — IP ni qo'lda kiriting",
      },
    };
  }

  async findAll() {
    const list = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { systemTemplate: { select: { name: true, key: true } } },
    });
    return list.map((t) => this.withDnsInfo(t));
  }

  async findOne(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: { systemTemplate: true },
    });
    if (!t) throw new NotFoundException('Tenant topilmadi');
    return this.withDnsInfo(t);
  }

  /** Muvaffaqiyatsiz provisioning'ni qayta urinish. */
  async retry(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: { systemTemplate: true },
    });
    if (!t) throw new NotFoundException('Tenant topilmadi');
    if (t.status === 'PROVISIONING') {
      throw new ConflictException('Provisioning allaqachon ketmoqda');
    }
    await this.provisioning.provision({
      tenantId: t.id,
      dbName: t.dbName,
      domain: t.domain,
      pm2Name: t.pm2Name,
      port: t.port,
      name: t.name,
      brandColor: t.brandColor,
      logoUrl: t.logoUrl,
      botToken: t.botToken,
      templateDir: t.systemTemplate.templateDir,
    });
    return { ok: true, status: 'PROVISIONING' };
  }
}
