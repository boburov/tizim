import { IsObject } from 'class-validator';

/**
 * Sozlama qiymatlari: { "GEMINI_API_KEY": "...", "MULTI_BRANCH": "false" }.
 *
 * Kalitlar va turlar `settings.registry.ts` bo'yicha tekshiriladi —
 * shuning uchun bu yerda faqat "obyekt keldimi" deb qaraladi. Noma'lum
 * kalit servisda rad etiladi.
 */
export class UpdateSettingsDto {
  @IsObject({ message: "Sozlamalar obyekt ko'rinishida bo'lishi kerak" })
  values!: Record<string, unknown>;
}
