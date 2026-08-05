import { Controller, Get, UseGuards } from '@nestjs/common';
import { GithubService } from './github.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

/**
 * Integratsiya holati — panel shu javobga qarab GitHub bo'limlarini
 * ko'rsatadi yoki yashiradi. Sozlanmagan integratsiya uchun katakcha
 * chiqarish foydalanuvchini chalg'itadi: u yoqadi, natija esa bo'lmaydi.
 */
@UseGuards(JwtAuthGuard)
@Controller('github')
export class GithubController {
  constructor(private readonly github: GithubService) {}

  @Get('status')
  status() {
    return {
      configured: this.github.isConfigured(),
      owner: this.github.owner || null,
      ownerType: (process.env.GITHUB_OWNER_TYPE || 'user').toLowerCase(),
      // Repo yopiq bo'ladimi — panelda ochiq aytiladi, chunki mijoz kodi
      // ochiq repoga tushib qolishi jiddiy oqibat.
      privateByDefault: (process.env.GITHUB_REPO_PRIVATE || 'true') !== 'false',
      deleteOnDeprovision:
        (process.env.GITHUB_DELETE_REPO_ON_DEPROVISION || 'false') === 'true',
    };
  }
}
