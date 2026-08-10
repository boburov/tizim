import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GithubModule } from '../github/github.module.js';
import { BotsController } from './bots.controller.js';
import { BotsService } from './bots.service.js';
import { BotProvisioningService } from './bot-provisioning.service.js';

@Module({
  imports: [PrismaModule, GithubModule],
  controllers: [BotsController],
  providers: [BotsService, BotProvisioningService],
  exports: [BotsService],
})
export class BotsModule {}
