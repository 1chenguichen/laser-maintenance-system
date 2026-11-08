import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Warehouse } from '../database/entities/warehouse.entity.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';
@Module({imports:[AuthModule,TypeOrmModule.forFeature([Warehouse])],controllers:[OperationsController],providers:[OperationsService]})
export class OperationsModule {}
