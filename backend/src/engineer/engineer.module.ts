import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngineerController } from './engineer.controller.js';
import { EngineerService } from './engineer.service.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { DispatchModule } from '../dispatch/dispatch.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Engineer, WorkOrder]), AuthModule, DispatchModule],
  controllers: [EngineerController],
  providers: [EngineerService],
  exports: [EngineerService],
})
export class EngineerModule {}
