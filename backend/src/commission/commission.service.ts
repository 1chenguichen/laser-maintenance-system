import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EngineerMonthlyStats } from '../database/entities/engineer-monthly-stats.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';

@Injectable()
export class CommissionService {
  // 提成等级配置
  private readonly TIERS = [
    { min: 1, max: 10, rate: 0.20, name: '20%' },
    { min: 11, max: 30, rate: 0.25, name: '25%' },
    { min: 31, max: Infinity, rate: 0.30, name: '30%' },
  ];

  constructor(
    @InjectRepository(EngineerMonthlyStats) private statsRepo: Repository<EngineerMonthlyStats>,
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
  ) {}

  // 计算订单提成
  calculateCommission(orderCount: number, revenue: number): { rate: number; amount: number; tier: string } {
    const tier = this.TIERS.find((t) => orderCount >= t.min && orderCount <= t.max) || this.TIERS[0];
    const amount = revenue * tier.rate;
    return {
      rate: tier.rate,
      amount,
      tier: tier.name,
    };
  }

  // 获取当前等级信息
  getCurrentTier(orderCount: number): {
    currentTier: { range: string; rate: string };
    nextTier: { range: string; rate: string; remaining: number } | null;
  } {
    const currentTierConfig = this.TIERS.find((t) => orderCount >= t.min && orderCount <= t.max) || this.TIERS[0];

    const currentTier = {
      range: currentTierConfig.max === Infinity
        ? `${currentTierConfig.min}+单`
        : `${currentTierConfig.min}-${currentTierConfig.max}单`,
      rate: currentTierConfig.name,
    };

    let nextTier = null;
    const currentIndex = this.TIERS.indexOf(currentTierConfig);
    if (currentIndex < this.TIERS.length - 1) {
      const next = this.TIERS[currentIndex + 1];
      nextTier = {
        range: next.max === Infinity ? `${next.min}+单` : `${next.min}-${next.max}单`,
        rate: next.name,
        remaining: next.min - orderCount,
      };
    }

    return { currentTier, nextTier };
  }

  // 更新工程师月度统计
  async updateMonthlyStats(engineerId: string, orderAmount: number): Promise<EngineerMonthlyStats> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let stats = await this.statsRepo.findOne({
      where: { engineerId, year, month },
    });

    if (!stats) {
      stats = this.statsRepo.create({
        engineerId,
        year,
        month,
        orderCount: 0,
        totalRevenue: 0,
        commissionAmount: 0,
        commissionRate: 0.20,
      });
    }

    stats.orderCount += 1;
    stats.totalRevenue = Number(stats.totalRevenue) + orderAmount;

    // 重新计算提成比例
    const commission = this.calculateCommission(stats.orderCount, Number(stats.totalRevenue));
    stats.commissionRate = commission.rate;
    stats.commissionAmount = commission.amount;

    return this.statsRepo.save(stats);
  }

  // 获取工程师月度统计
  async getMonthlyStats(engineerId: string, year?: number, month?: number): Promise<EngineerMonthlyStats[]> {
    const now = new Date();
    const where: any = { engineerId };

    if (year) where.year = year;
    if (month) where.month = month;

    return this.statsRepo.find({
      where,
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  // 每月1日重置（定时任务调用）
  async resetMonthlyStats(): Promise<void> {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    // 将上月的统计数据归档（保留记录但标记为历史）
    await this.statsRepo.update(
      { year, month },
      { isArchived: true },
    );

    // 工程师月订单和月收入重置（由数据库触发器或应用层处理）
    await this.engineerRepo.update({}, { monthlyOrders: 0, monthlyRevenue: 0 });
  }

  // 获取收益明细
  async getRevenueDetails(engineerId: string, year: number, month: number) {
    const stats = await this.statsRepo.findOne({
      where: { engineerId, year, month },
    });

    if (!stats) {
      return {
        year,
        month,
        orderCount: 0,
        totalRevenue: 0,
        commissionRate: 0.20,
        commissionAmount: 0,
        tier: this.getCurrentTier(0),
      };
    }

    return {
      year,
      month,
      orderCount: stats.orderCount,
      totalRevenue: Number(stats.totalRevenue),
      commissionRate: stats.commissionRate,
      commissionAmount: Number(stats.commissionAmount),
      tier: this.getCurrentTier(stats.orderCount),
    };
  }
}
