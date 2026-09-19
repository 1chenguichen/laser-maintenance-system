import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PaymentService, PayType } from './payment.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  /**
   * 创建预付定金支付订单
   */
  @Post('prepay')
  async createPrepayOrder(
    @Body() body: { workOrderId: string; payType: string },
  ) {
    const payType = body.payType === 'alipay' ? PayType.ALIPAY : PayType.WECHAT;
    return this.paymentService.createPrepayOrder(body.workOrderId, payType);
  }

  /**
   * 支付回调（微信/支付宝服务器回调）
   */
  @Post('callback')
  async paymentCallback(@Body() body: { orderId: string; status: string }) {
    const status = body.status === 'success'
      ? 'success'
      : body.status === 'failed'
        ? 'failed'
        : 'pending';
    const success = await this.paymentService.handleCallback(body.orderId, status as any);
    return { success };
  }

  /**
   * 查询支付状态
   */
  @Get('status/:workOrderId')
  async getPayStatus(@Param('workOrderId') workOrderId: string) {
    return this.paymentService.queryPayStatus(workOrderId);
  }

  /**
   * 申请退款
   */
  @Post('refund')
  async applyRefund(
    @Body() body: { workOrderId: string; amount: number; reason: string },
  ) {
    return this.paymentService.applyRefund(body.workOrderId, body.amount, body.reason);
  }

  /**
   * 结算费用（多退少补）
   */
  @Post('settle')
  async settleAmount(
    @Body() body: { workOrderId: string; actualAmount: number },
  ) {
    return this.paymentService.settleAmount(body.workOrderId, body.actualAmount);
  }
}
