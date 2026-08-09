import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiGatewayService } from './api-gateway.service.js';
import { AuthorizeDto, IngestUsageDto } from './dto/api-gateway.dto.js';
import { GatewaySecretGuard } from './gateway-secret.guard.js';

/**
 * API xizmatlarning o'zi (data plane) chaqiradigan endpointlar.
 *
 * JwtAuthGuard BO'LMASLIGI shart — bu server-server chaqiruvi, foydalanuvchi
 * sessiyasi yo'q. Himoya `x-gateway-secret` header'i orqali.
 */
@UseGuards(GatewaySecretGuard)
@Controller('api-gateway')
export class ApiGatewayController {
  constructor(private readonly gateway: ApiGatewayService) {}

  /**
   * Kalitni tekshirib, tarif raqamlarini qaytaradi.
   *
   * Xizmat javobni ~60 soniya keshlaydi, shuning uchun bu endpoint har
   * so'rovda emas, har kalit uchun daqiqada bir marta chaqiriladi.
   *
   * Rad etilgan kalit ham 200 bilan qaytadi (`allowed:false`) — bu xato emas,
   * javob. Xizmat `reason` ga qarab o'z HTTP statusini tanlaydi.
   */
  @Post('authorize')
  @HttpCode(200)
  authorize(@Body() dto: AuthorizeDto) {
    return this.gateway.authorize(dto.key);
  }

  /** Xizmat lokalda sanagan so'rovlar farqini qabul qiladi. */
  @Post('usage')
  @HttpCode(200)
  usage(@Body() dto: IngestUsageDto) {
    return this.gateway.ingestUsage(dto);
  }
}
