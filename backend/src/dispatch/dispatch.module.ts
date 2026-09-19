import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { DispatchRecord } from '../database/entities/dispatch-record.entity.js';
import { Notification } from '../database/entities/notification.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrder, Engineer, DispatchRecord, Notification]), AuthModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
