import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { EngineerService } from './engineer.service.js';
import { UpdateStatusDto, UpdateLocationDto, GrabOrderDto, AcceptDesignatedOrderDto, CompleteOrderDto, UploadPhotoDto, QuoteOrderDto } from './engineer.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkOrderStatus } from '../database/entities/enums.js';
import type { AuthenticatedRequest } from '../auth/types.js';

@Controller('engineer')
@UseGuards(JwtAuthGuard)
export class EngineerController {
  constructor(private engineerService: EngineerService) {}

  // ==================== 状态 ====================
  @Get('status')
  async getStatus(@Request() req: AuthenticatedRequest) {
    return this.engineerService.getStatus(req.user.sub);
  }

  @Put('status')
  async updateStatus(@Request() req: AuthenticatedRequest, @Body() dto: UpdateStatusDto) {
    return this.engineerService.updateStatus(req.user.sub, dto);
  }

  // ==================== 位置 ====================
  @Put('location')
  async updateLocation(@Request() req: AuthenticatedRequest, @Body() dto: UpdateLocationDto) {
    return this.engineerService.updateLocation(req.user.sub, dto);
  }

  // ==================== 订单池 ====================
  @Get('grab-pool')
  async getGrabPool(@Request() req: AuthenticatedRequest) {
    return this.engineerService.getGrabPool(req.user.sub);
  }

  @Post('grab')
  async grabOrder(@Request() req: AuthenticatedRequest, @Body() dto: GrabOrderDto) {
    return this.engineerService.grabOrder(req.user.sub, dto);
  }

  // ==================== 指派单 ====================
  @Get('designated-orders')
  async getDesignatedOrders(@Request() req: AuthenticatedRequest) {
    return this.engineerService.getDesignatedOrders(req.user.sub);
  }

  @Post('accept-designated')
  async acceptDesignatedOrder(@Request() req: AuthenticatedRequest, @Body() dto: AcceptDesignatedOrderDto) {
    return this.engineerService.acceptDesignatedOrder(req.user.sub, dto);
  }

  @Post('refuse-designated/:id')
  async refuseDesignatedOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body('reason') reason: string) {
    return this.engineerService.refuseDesignatedOrder(req.user.sub, id, reason);
  }

  // ==================== 我的订单 ====================
  @Get('orders')
  async getMyOrders(@Request() req: AuthenticatedRequest, @Query('status') status?: WorkOrderStatus) {
    return this.engineerService.getMyOrders(req.user.sub, status);
  }

  @Get('orders/:id')
  async getOrderDetail(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.engineerService.getOrderDetail(req.user.sub, id);
  }

  // ==================== 服务流程 ====================
  @Post('orders/:id/start')
  async startService(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.engineerService.startService(req.user.sub, id);
  }

  @Post('orders/:id/complete')
  async completeOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: CompleteOrderDto) {
    return this.engineerService.completeOrder(req.user.sub, id, dto);
  }

  @Post('orders/:id/photo')
  async uploadPhoto(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UploadPhotoDto) {
    return this.engineerService.uploadPhoto(req.user.sub, id, dto.photoUrl, dto.type);
  }

  @Post('orders/:id/quote')
  async quoteOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: QuoteOrderDto) {
    return this.engineerService.quoteOrder(req.user.sub, id, dto);
  }

  // ==================== 收益统计 ====================
  @Get('stats')
  async getStats(@Request() req: AuthenticatedRequest) {
    return this.engineerService.getStats(req.user.sub);
  }
}
