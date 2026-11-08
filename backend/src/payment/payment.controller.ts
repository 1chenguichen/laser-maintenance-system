import { Roles } from '../auth/roles.decorator.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Controller, Post, Get, Body, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { PaymentService, PayType } from './payment.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('payment')
@UseGuards(JwtAuthGuard)
@Roles('customer', 'cs_operator')
export class PaymentController {
  constructor(private paymentService: PaymentService, @InjectRepository(WorkOrder) private orders: Repository<WorkOrder>) {}

  private async checkOwner(req: any, id: string) {
    if (req.user.role === 'cs_operator') return;
    if (!await this.orders.findOneBy({ id, customerId: req.user.sub })) throw new ForbiddenException('无权操作该工单');
  }

  /**
   * 创建预付定金支付订单
   */
  @Post('prepay')
  async createPrepayOrder(
    @Body() body: { workOrderId: string; payType: string }, @Request() req: any,
  ) {
    await this.checkOwner(req, body.workOrderId);
    const payType = body.payType === 'alipay' ? PayType.ALIPAY : PayType.WECHAT;
    return this.paymentService.createPrepayOrder(body.workOrderId, payType);
  }

  /**
   * 支付回调（微信/支付宝服务器回调）
   */
  @Post('callback')
  @Roles('cs_operator')
  async paymentCallback(@Body() body: { orderId: string; status: string }) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException('真实支付回调尚未接入签名校验，模拟回调仅限开发环境');
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
  async getPayStatus(@Param('workOrderId') workOrderId: string, @Request() req: any) {
    await this.checkOwner(req, workOrderId);
    return this.paymentService.queryPayStatus(workOrderId);
  }

  /**
   * 申请退款
   */
  @Post('refund')
  async applyRefund(
    @Body() body: { workOrderId: string; amount: number; reason: string }, @Request() req: any,
  ) {
    await this.checkOwner(req, body.workOrderId);
    return this.paymentService.applyRefund(body.workOrderId, body.amount, body.reason);
  }

  /**
   * 结算费用（多退少补）
   */
  @Post('settle')
  @Roles('cs_operator')
  async settleAmount(
    @Body() body: { workOrderId: string; actualAmount: number },
  ) {
    return this.paymentService.settleAmount(body.workOrderId, body.actualAmount);
  }
}
