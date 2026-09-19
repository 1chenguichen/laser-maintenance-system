import { describe, it, expect } from 'vitest';
import { CommissionService } from './commission.service.js';

describe('CommissionService', () => {
  // 创建一个不依赖数据库的测试版本
  const createService = () => {
    const service = Object.create(CommissionService.prototype);
    service.TIERS = [
      { min: 1, max: 10, rate: 0.20, name: '20%' },
      { min: 11, max: 30, rate: 0.25, name: '25%' },
      { min: 31, max: Infinity, rate: 0.30, name: '30%' },
    ];
    return service;
  };

  describe('calculateCommission', () => {
    it('1-10单区间，提成20%', () => {
      const service = createService();
      const result = service.calculateCommission(5, 1000);
      expect(result.rate).toBe(0.20);
      expect(result.amount).toBe(200);
      expect(result.tier).toBe('20%');
    });

    it('10单时仍为20%区间', () => {
      const service = createService();
      const result = service.calculateCommission(10, 1000);
      expect(result.rate).toBe(0.20);
      expect(result.amount).toBe(200);
    });

    it('11-30单区间，提成25%', () => {
      const service = createService();
      const result = service.calculateCommission(15, 1000);
      expect(result.rate).toBe(0.25);
      expect(result.amount).toBe(250);
      expect(result.tier).toBe('25%');
    });

    it('30单时仍为25%区间', () => {
      const service = createService();
      const result = service.calculateCommission(30, 1000);
      expect(result.rate).toBe(0.25);
      expect(result.amount).toBe(250);
    });

    it('31单及以上区间，提成30%', () => {
      const service = createService();
      const result = service.calculateCommission(35, 1000);
      expect(result.rate).toBe(0.30);
      expect(result.amount).toBe(300);
      expect(result.tier).toBe('30%');
    });

    it('0单默认20%', () => {
      const service = createService();
      const result = service.calculateCommission(0, 1000);
      expect(result.rate).toBe(0.20);
    });
  });

  describe('getCurrentTier', () => {
    it('5单属于1-10单区间', () => {
      const service = createService();
      const result = service.getCurrentTier(5);
      expect(result.currentTier.range).toBe('1-10单');
      expect(result.currentTier.rate).toBe('20%');
      expect(result.nextTier).not.toBeNull();
      expect(result.nextTier?.range).toBe('11-30单');
      expect(result.nextTier?.remaining).toBe(6);
    });

    it('10单属于1-10单区间，下一级为11-30单', () => {
      const service = createService();
      const result = service.getCurrentTier(10);
      expect(result.currentTier.range).toBe('1-10单');
      expect(result.nextTier?.remaining).toBe(1);
    });

    it('15单属于11-30单区间', () => {
      const service = createService();
      const result = service.getCurrentTier(15);
      expect(result.currentTier.range).toBe('11-30单');
      expect(result.currentTier.rate).toBe('25%');
      expect(result.nextTier).not.toBeNull();
      expect(result.nextTier?.range).toBe('31+单');
      expect(result.nextTier?.remaining).toBe(16);
    });

    it('31单属于31+单区间，无下一级', () => {
      const service = createService();
      const result = service.getCurrentTier(31);
      expect(result.currentTier.range).toBe('31+单');
      expect(result.currentTier.rate).toBe('30%');
      expect(result.nextTier).toBeNull();
    });

    it('100单属于31+单区间', () => {
      const service = createService();
      const result = service.getCurrentTier(100);
      expect(result.currentTier.range).toBe('31+单');
      expect(result.nextTier).toBeNull();
    });
  });
});
