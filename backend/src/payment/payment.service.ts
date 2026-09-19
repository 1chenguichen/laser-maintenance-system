import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { WorkOrderStatus } from '../database/entities/enums.js';

export enum PayType {
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
}

export enum PayStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(WorkOrder) private workOrderRepo: Repository<WorkOrder>,
  ) {}

  /**
   * 创建支付订单（预付定金 30%）
   */
  async createPrepayOrder(workOrderId: string, payType: PayType): Promise<{
    orderId: string;
    payUrl: string;
    qrCode: string;
    amount: number;
    expireTime: string;
  }> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    // 计算定金金额（30%）
    const amount = Math.round((workOrder.estimatedAmount || 0) * 0.3 * 100) / 100;

    // 生成支付订单号
    const payOrderId = `PAY${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    // 模拟支付链接（实际对接微信/支付宝需要商户号和密钥）
    const payUrl = payType === PayType.WECHAT
      ? `weixin://wxpay/bizpayurl?pr=${payOrderId}`
      : `https://openapi.alipay.com/gateway.do?out_trade_no=${payOrderId}`;

    // 30 分钟过期
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return {
      orderId: payOrderId,
      payUrl,
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payUrl)}`,
      amount,
      expireTime,
    };
  }

  /**
   * 支付回调处理（模拟）
   */
  async handleCallback(payOrderId: string, status: PayStatus): Promise<boolean> {
    // 实际生产环境需要验证签名
    if (status === PayStatus.SUCCESS) {
      // 更新工单定金状态
      const workOrder = await this.workOrderRepo.findOne({ where: { id: payOrderId } });
      if (workOrder) {
        workOrder.prepayAmount = workOrder.estimatedAmount * 0.3;
        await this.workOrderRepo.save(workOrder);
      }
      return true;
    }
    return false;
  }

  /**
   * 查询支付状态
   */
  async queryPayStatus(workOrderId: string): Promise<{
    paid: boolean;
    prepayAmount: number;
    payStatus: string;
  }> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    return {
      paid: !!workOrder.prepayAmount,
      prepayAmount: workOrder.prepayAmount || 0,
      payStatus: workOrder.prepayAmount ? 'paid' : 'unpaid',
    };
  }

  /**
   * 申请退款（实际退款需要商户后台操作）
   */
  async applyRefund(workOrderId: string, amount: number, reason: string): Promise<{
    success: boolean;
    refundId: string;
    refundAmount: number;
  }> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    // 生成退款单号
    const refundId = `REF${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    // 模拟退款（实际需要调用微信/支付宝退款接口）
    return {
      success: true,
      refundId,
      refundAmount: amount,
    };
  }

  /**
   * 计算最终费用（多退少补）
   */
  async settleAmount(workOrderId: string, actualAmount: number): Promise<{
    prepayAmount: number;
    finalAmount: number;
    supplement: number;  // 需补缴
    refund: number;      // 需退还
  }> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    const prepayAmount = workOrder.prepayAmount || 0;
    const finalAmount = actualAmount;
    const difference = finalAmount - prepayAmount;

    return {
      prepayAmount,
      finalAmount,
      supplement: difference > 0 ? difference : 0,
      refund: difference < 0 ? Math.abs(difference) : 0,
    };
  }
}
