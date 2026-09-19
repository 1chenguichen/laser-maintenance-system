import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';
import { Customer } from '../database/entities/customer.entity.js';
import { Address } from '../database/entities/address.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Review } from '../database/entities/review.entity.js';
import { Complaint } from '../database/entities/complaint.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { DispatchModule } from '../dispatch/dispatch.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Address, Device, WorkOrder, Review, Complaint, Engineer]), AuthModule, DispatchModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
