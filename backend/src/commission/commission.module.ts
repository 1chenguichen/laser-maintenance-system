import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionService } from './commission.service.js';
import { EngineerMonthlyStats } from '../database/entities/engineer-monthly-stats.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([EngineerMonthlyStats, Engineer])],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule {}
