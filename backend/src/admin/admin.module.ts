import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { Customer } from '../database/entities/customer.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { Part } from '../database/entities/part.entity.js';
import { Address } from '../database/entities/address.entity.js';
import { Complaint } from '../database/entities/complaint.entity.js';
import { Review } from '../database/entities/review.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkOrder,
      Engineer,
      Customer,
      Device,
      Part,
      Address,
      Complaint,
      Review,
    ]),
    AuthModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
