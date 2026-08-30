import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { FEATURE_BY_KEY } from './feature-registry.js';
import { ModuleFeaturesService } from './module-features.service.js';

export const CAPABILITY_KEY = 'feature_capability';

/**
 * Marshrut MODUL ichidagi alohida IMKONIYATNI talab qiladi
 * (`imports.finance` kabi).
 *
 * ⚠ MODUL darvozasi middleware, IMKONIYAT esa guard — chunki imkoniyat
 * tabiatan marshrutga xos: bitta kontrollerning bir qismi sotiladi, bir
 * qismi yo'q. Foydalanuvchi bu yerga yetib kelgan bo'lsa modul darvozasi
 * va autentifikatsiya allaqachon o'tgan, ya'ni 402 to'g'ri javob.
 */
export const RequiresCapability = (key: string) =>
  SetMetadata(CAPABILITY_KEY, key);

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: ModuleFeaturesService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const key = this.reflector.getAllAndOverride<string | undefined>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Dekorator yo'q — bu marshrut imkoniyat talab qilmaydi.
    if (!key) return true;

    if (this.features.isModuleEnabled(key)) return true;

    const label = FEATURE_BY_KEY.get(key)?.label ?? key;
    throw new ApiError(402, `${label} tarifingizda mavjud emas`, {
      code: 'FEATURE_NOT_AVAILABLE',
      details: { featureKey: key },
    });
  }
}
