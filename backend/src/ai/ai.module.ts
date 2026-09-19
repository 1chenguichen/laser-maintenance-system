import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceChat } from '../database/entities/service-chat.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Customer } from '../database/entities/customer.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { CsPollingService } from './cs-polling.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceChat, WorkOrder, Customer]), AuthModule],
  controllers: [AiController],
  providers: [AiService, CsPollingService],
  exports: [AiService, CsPollingService],
})
export class AiModule {}
