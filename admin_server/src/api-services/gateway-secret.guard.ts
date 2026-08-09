/**
 * Data plane (API xizmatning o'zi) bilan server-server autentifikatsiya.
 *
 * Bu marshrutlarda JWT YO'Q — chaqiruvchi foydalanuvchi emas, xizmat.
 * `usage/usage.controller.ts` dagi heartbeat bilan bir xil yondashuv:
 * umumiy sir, header orqali.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export const GATEWAY_SECRET_HEADER = 'x-gateway-secret';

@Injectable()
export class GatewaySecretGuard implements CanActivate {
  private readonly logger = new Logger(GatewaySecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.API_GATEWAY_SECRET || '';

    // Sir sozlanmagan bo'lsa marshrut OCHIQ qolib ketmasligi kerak.
    if (!expected) {
      this.logger.error(
        "API_GATEWAY_SECRET .env'da yo'q — gateway marshrutlari yopiq. " +
          'Sir yarating: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
      throw new ServiceUnavailableException('Gateway sozlanmagan');
    }

    const req = context.switchToHttp().getRequest();
    const got = req.headers?.[GATEWAY_SECRET_HEADER];

    if (typeof got !== 'string' || !secretsMatch(got, expected)) {
      throw new UnauthorizedException("Gateway kaliti noto'g'ri");
    }
    return true;
  }
}

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
