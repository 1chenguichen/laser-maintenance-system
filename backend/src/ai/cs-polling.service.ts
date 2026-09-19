import { Injectable } from '@nestjs/common';

// 待接入客户队列
export interface WaitingCustomer {
  customerId: string;
  customerName: string;
  lastMessage: string;
  waitingTime: number;
  timestamp: number;
}

// 活跃会话（客服正在服务的客户）
export interface ActiveSession {
  customerId: string;
  customerName: string;
  csOperatorId: string;
  startTime: number;
}

// 客服轮询服务 - 提供HTTP轮询后备方案
@Injectable()
export class CsPollingService {
  // 待接入客户队列
  private waitingCustomers = new Map<string, WaitingCustomer>();

  // 活跃会话（customerId -> session）
  private activeSessions = new Map<string, ActiveSession>();

  // 添加等待中的客户
  addWaitingCustomer(data: WaitingCustomer) {
    this.waitingCustomers.set(data.customerId, data);
  }

  // 获取所有等待中的客户
  getWaitingCustomers(): WaitingCustomer[] {
    return Array.from(this.waitingCustomers.values());
  }

  // 移除已接入的客户
  removeCustomer(customerId: string) {
    this.waitingCustomers.delete(customerId);
  }

  // 更新等待时间
  updateWaitTime(customerId: string) {
    const customer = this.waitingCustomers.get(customerId);
    if (customer) {
      customer.waitingTime = Math.floor((Date.now() - customer.timestamp) / 1000);
    }
  }

  // 客服接入客户：从未接入队列移除，加入活跃会话
  startSession(customerId: string, csOperatorId: string) {
    this.waitingCustomers.delete(customerId);
    // 查找客户名称
    this.activeSessions.set(customerId, {
      customerId,
      customerName: '', // caller should set this
      csOperatorId,
      startTime: Date.now(),
    });
  }

  // 结束会话
  endSession(customerId: string) {
    this.activeSessions.delete(customerId);
  }

  // 获取客户对应的活跃会话
  getSession(customerId: string): ActiveSession | undefined {
    return this.activeSessions.get(customerId);
  }

  // 客户是否在活跃会话中
  isInSession(customerId: string): boolean {
    return this.activeSessions.has(customerId);
  }

  // 获取活跃会话列表
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }
}
