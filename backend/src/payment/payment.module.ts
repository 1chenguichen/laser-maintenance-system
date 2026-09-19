import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrder])],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
