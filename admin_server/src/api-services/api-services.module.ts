import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ApiServicesController } from './api-services.controller.js';
import { ApiServicesService } from './api-services.service.js';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ApiServicesController, ApiGatewayController],
  providers: [ApiServicesService, ApiGatewayService],
  exports: [ApiServicesService],
})
export class ApiServicesModule {}
