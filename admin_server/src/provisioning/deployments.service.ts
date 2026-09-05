import { Injectable, NotFoundException } from '@nestjs/common';
import type { Deployment, DeploymentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOG_LIMIT } from './script-runner.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEPLOY JURNALI — HAR AMAL BITTA YOZUV, LOG TIRIK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `start()` yozuv ochadi va `DeploymentHandle` qaytaradi. Skript
 * chiqishi `handle.log(chunk)` ga tushadi; u xotirada yig'iladi va
 * ~1 soniyada bir bazaga yoziladi (har bo'lakda yozish 20 daqiqalik
 * provision'da minglab UPDATE bo'lardi). `finish()` oxirgi logni,
 * kodni va holatni yozadi.
 *
 * ⚠ Bitta tenantda bir vaqtda BITTA `RUNNING` deploy: `assertIdle()`
 * — parallel provision va reconfigure bir papkani buzardi.
 */
export interface DeploymentHandle {
  id: string;
  log: (chunk: string) => void;
  finish: (r: { code: number | null; error?: string | null; meta?: Prisma.InputJsonValue }) => Promise<Deployment>;
  fail: (error: string) => Promise<Deployment>;
  setMeta: (meta: Prisma.InputJsonValue) => Promise<void>;
}

const FLUSH_MS = 1000;

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string, limit = 30) {
    return this.prisma.deployment.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true, kind: true, status: true, exitCode: true, error: true,
        startedBy: true, startedAt: true, finishedAt: true, meta: true,
        vps: { select: { id: true, name: true, host: true } },
      },
    });
  }

  async get(id: string) {
    const d = await this.prisma.deployment.findUnique({
      where: { id },
      include: { vps: { select: { id: true, name: true, host: true } } },
    });
    if (!d) throw new NotFoundException('Deploy yozuvi topilmadi');
    return d;
  }

  /** Tenantda ishlab turgan deploy bormi — bo'lsa uni qaytaradi. */
  async running(tenantId: string) {
    return this.prisma.deployment.findFirst({
      where: { tenantId, status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async start(input: {
    tenantId: string;
    vpsId?: string | null;
    kind: DeploymentKind;
    startedBy?: string | null;
    meta?: Prisma.InputJsonValue;
  }): Promise<DeploymentHandle> {
    const row = await this.prisma.deployment.create({
      data: {
        tenantId: input.tenantId,
        vpsId: input.vpsId ?? null,
        kind: input.kind,
        startedBy: input.startedBy ?? null,
        meta: input.meta ?? undefined,
      },
    });

    let buffer = '';
    let dirty = false;
    let timer: NodeJS.Timeout | null = null;
    let finished = false;

    const flush = async () => {
      timer = null;
      if (!dirty || finished) return;
      dirty = false;
      await this.prisma.deployment
        .update({ where: { id: row.id }, data: { log: buffer } })
        .catch(() => undefined);
    };

    const log = (chunk: string) => {
      buffer += chunk;
      if (buffer.length > LOG_LIMIT) buffer = buffer.slice(-LOG_LIMIT);
      dirty = true;
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    };

    const finish = async (r: { code: number | null; error?: string | null; meta?: Prisma.InputJsonValue }) => {
      finished = true;
      if (timer) { clearTimeout(timer); timer = null; }
      const ok = r.code === 0 && !r.error;
      return this.prisma.deployment.update({
        where: { id: row.id },
        data: {
          status: ok ? 'SUCCESS' : 'FAILED',
          exitCode: r.code ?? null,
          error: r.error ?? (ok ? null : `Skript ${r.code} kodi bilan tugadi`),
          log: buffer,
          finishedAt: new Date(),
          ...(r.meta !== undefined ? { meta: r.meta } : {}),
        },
      });
    };

    return {
      id: row.id,
      log,
      finish,
      fail: (error: string) => finish({ code: -1, error }),
      setMeta: async (meta) => {
        await this.prisma.deployment.update({ where: { id: row.id }, data: { meta } }).catch(() => undefined);
      },
    };
  }
}
