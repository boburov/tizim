import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ProvisionInput {
  tenantId: string;
  dbName: string;
  domain: string;
  pm2Name: string;
  port: number;
  name: string;
  brandColor: string;
  logoUrl?: string | null;
  botToken?: string | null;
  templateDir: string;
}

/**
 * VPS'da provision.sh skriptini ishga tushiradi. Skript har tenant uchun
 * client+server nusxalaydi, .env yozadi (noyob DB nomi), pm2 + nginx + certbot
 * sozlaydi. Bu asinxron ishlaydi — jarayon status'ni DB'da yangilaydi.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Provisioning'ni fon rejimida boshlaydi (bloklamaydi). */
  async provision(input: ProvisionInput): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: input.tenantId },
      data: { status: 'PROVISIONING', failureReason: null, provisionLog: '' },
    });

    const scriptPath =
      process.env.PROVISION_SCRIPT || '/root/admin/provision.sh';

    // Skriptga argumentlarni ENV orqali beramiz (maxfiy tokenlar CLI'da ko'rinmasin).
    const childEnv = {
      ...process.env,
      TENANT_DB_NAME: input.dbName,
      TENANT_DOMAIN: input.domain,
      TENANT_PM2_NAME: input.pm2Name,
      TENANT_PORT: String(input.port),
      TENANT_NAME: input.name,
      TENANT_BRAND_COLOR: input.brandColor,
      TENANT_LOGO_URL: input.logoUrl || '',
      TENANT_BOT_TOKEN: input.botToken || '',
      TENANT_TEMPLATE_DIR: input.templateDir,
    };

    this.logger.log(
      `Provisioning boshlandi: ${input.domain} (db=${input.dbName}, port=${input.port})`,
    );

    const child = spawn('bash', [scriptPath], {
      env: childEnv,
      cwd: process.env.PROVISION_CWD || '/root/admin',
    });

    let log = '';
    const append = (chunk: Buffer) => {
      log += chunk.toString();
      // Log juda kattalashib ketmasin — oxirgi 60k belgi yetadi
      if (log.length > 60000) log = log.slice(-60000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    child.on('close', async (code) => {
      const serverIp = process.env.SERVER_PUBLIC_IP || null;
      if (code === 0) {
        await this.prisma.tenant.update({
          where: { id: input.tenantId },
          data: { status: 'ACTIVE', provisionLog: log, serverIp },
        });
        this.logger.log(`Provisioning tugadi: ${input.domain} ✅`);
      } else {
        await this.prisma.tenant.update({
          where: { id: input.tenantId },
          data: {
            status: 'FAILED',
            provisionLog: log,
            failureReason: `provision.sh xato kodi bilan tugadi: ${code}`,
          },
        });
        this.logger.error(`Provisioning muvaffaqiyatsiz: ${input.domain} ❌`);
      }
    });

    child.on('error', async (err) => {
      await this.prisma.tenant.update({
        where: { id: input.tenantId },
        data: {
          status: 'FAILED',
          failureReason: `Skriptni ishga tushirib bo'lmadi: ${err.message}`,
        },
      });
      this.logger.error(`Skript xatosi: ${err.message}`);
    });
  }
}
