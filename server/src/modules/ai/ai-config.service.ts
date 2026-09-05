import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

import { AI_ENGINE_VERSION } from './ai.constants.js';
import {
  DEFAULT_CHURN_WEIGHTS,
  DEFAULT_PAYMENT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_CONFIDENCE_FLOOR,
} from './ai.constants.js';

/**
 * AI SOZLAMALARI — `services/aiConfig.service.js` ning KO'CHIRMASI.
 *
 * ⚠ VAZNLAR VA CHEGARALAR TEGILMADI: `CODE_DEFAULTS` Express bilan
 * AYNAN bir xil. Bitta raqamning siljishi BARCHA ballarni siljitardi.
 */
const toPlain = (row: any) => {
  if (!row) return null;
  const obj = { ...row };
  for (const key of ["churnWeights", "paymentWeights", "thresholds"]) {
    const v = obj[key];
    obj[key] = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }
  return obj;
};

export const CODE_DEFAULTS = Object.freeze({
  churnWeights: { ...DEFAULT_CHURN_WEIGHTS },
  paymentWeights: { ...DEFAULT_PAYMENT_WEIGHTS },
  thresholds: { ...DEFAULT_THRESHOLDS },
  confidenceFloor: DEFAULT_CONFIDENCE_FLOOR,
  narrationEnabled: false,
  narrationModel: "gemini-2.5-flash",
  engineVersion: AI_ENGINE_VERSION,
});

@Injectable()
export class AiConfigService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Berilgan filial uchun amaldagi konfiguratsiyani qaytaradi.
   * @param {string|null} branchId
   */
  async resolveConfig(branchId = null) {
  const [branchCfg, globalCfg] = await Promise.all([
    branchId
      ? this.prisma.aiConfig.findFirst({ where: { branchId: String(branchId) } })
      : null,
    // GLOBAL qator - `branchId IS NULL`. Bittadan ortiq bo'lmasligini
    // qisman unique indeks kafolatlaydi (`ai_configs_global_key`).
    this.prisma.aiConfig.findFirst({ where: { branchId: null } }),
  ]);

  const merged = { ...CODE_DEFAULTS };
  for (const cfg of [globalCfg, branchCfg]) {
    const plain = toPlain(cfg);
    if (!plain) continue;
    merged.churnWeights = { ...merged.churnWeights, ...(plain.churnWeights || {}) };
    merged.paymentWeights = { ...merged.paymentWeights, ...(plain.paymentWeights || {}) };
    merged.thresholds = { ...merged.thresholds, ...(plain.thresholds || {}) };
    if (plain.confidenceFloor != null) merged.confidenceFloor = plain.confidenceFloor;
    if (plain.narrationEnabled != null) merged.narrationEnabled = plain.narrationEnabled;
    if (plain.narrationModel) merged.narrationModel = plain.narrationModel;
  }
  return merged;
}

  /** Global yoki filial konfiguratsiyasini yangilaydi (yo'q bo'lsa yaratadi). */
  async upsertConfig(branchId: any,patch: any,userId: any) {
  // `updatedBy` -> `updatedById`: Prisma'da `updatedBy` RELATION.
  const set: any = {
    updatedById: userId ? String(userId) : null,
    engineVersion: AI_ENGINE_VERSION,
  };
  if (patch.churnWeights) set.churnWeights = patch.churnWeights;
  if (patch.paymentWeights) set.paymentWeights = patch.paymentWeights;
  if (patch.thresholds) set.thresholds = patch.thresholds;
  if (patch.confidenceFloor != null) set.confidenceFloor = patch.confidenceFloor;
  if (patch.narrationEnabled != null) set.narrationEnabled = patch.narrationEnabled;
  if (patch.narrationModel) set.narrationModel = patch.narrationModel;

  // `upsert` ISHLATILMAYDI: global qator `branchId IS NULL` bilan
  // aniqlanadi, Prisma `upsert` esa `where` da unique kalit talab qiladi
  // va `null` ni unique qiymat deb qabul qilmaydi (Postgres'da
  // `NULL != NULL`). Shu sababli find-then-write.
  const where = { branchId: branchId ? String(branchId) : null };
  const existing = await this.prisma.aiConfig.findFirst({ where });

  const doc = existing
    ? await this.prisma.aiConfig.update({ where: { id: existing.id }, data: set })
    : await this.prisma.aiConfig.create({
        data: {
          ...where,
          // Yangi qatorda `Json` ustunlar NOT NULL - schema'da default
          // yo'q, shuning uchun koddagi standartlar yoziladi.
          churnWeights: set.churnWeights || { ...DEFAULT_CHURN_WEIGHTS },
          paymentWeights: set.paymentWeights || { ...DEFAULT_PAYMENT_WEIGHTS },
          thresholds: set.thresholds || { ...DEFAULT_THRESHOLDS },
          ...set,
        },
      });
  return toPlain(doc);
}
}