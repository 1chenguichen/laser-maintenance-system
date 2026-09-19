import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartsController } from './parts.controller.js';
import { PartsService } from './parts.service.js';
import { Part } from '../database/entities/part.entity.js';
import { Warehouse } from '../database/entities/warehouse.entity.js';
import { PartsInventory } from '../database/entities/parts-inventory.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Part, Warehouse, PartsInventory]), AuthModule],
  controllers: [PartsController],
  providers: [PartsService],
  exports: [PartsService],
})
export class PartsModule {}
