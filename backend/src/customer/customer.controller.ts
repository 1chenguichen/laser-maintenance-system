import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, NotFoundException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { CustomerService } from './customer.service.js';
import { CreateAddressDto, UpdateAddressDto, CreateDeviceDto, CreateWorkOrderDto, CreateReviewDto, CreateComplaintDto } from './customer.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkOrderStatus } from '../database/entities/enums.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'fault-photos');

@Controller('customer')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private customerService: CustomerService) {}

  // ==================== 地址 ====================
  @Get('addresses')
  async getAddresses(@Request() req: AuthenticatedRequest) {
    return this.customerService.getAddresses(req.user.sub);
  }

  @Post('addresses')
  async createAddress(@Request() req: AuthenticatedRequest, @Body() dto: CreateAddressDto) {
    return this.customerService.createAddress(req.user.sub, dto);
  }

  @Put('addresses/:id')
  async updateAddress(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.customerService.updateAddress(req.user.sub, id, dto);
  }

  @Delete('addresses/:id')
  async deleteAddress(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.customerService.deleteAddress(req.user.sub, id);
    return { message: '删除成功' };
  }

  // ==================== 设备 ====================
  @Get('devices')
  async getDevices(@Request() req: AuthenticatedRequest) {
    return this.customerService.getDevices(req.user.sub);
  }

  @Post('devices')
  async createDevice(@Request() req: AuthenticatedRequest, @Body() dto: CreateDeviceDto) {
    return this.customerService.createDevice(req.user.sub, dto);
  }

  @Get('devices/query')
  async queryDevice(@Query('serial') serial: string) {
    return this.customerService.getDeviceBySerial(serial);
  }

  @Delete('devices/:id')
  async deleteDevice(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.customerService.deleteDevice(req.user.sub, id);
    return { message: '删除成功' };
  }

  // ==================== 工单 ====================
  @Get('work-orders')
  async getWorkOrders(@Request() req: AuthenticatedRequest, @Query('status') status?: WorkOrderStatus) {
    return this.customerService.getWorkOrders(req.user.sub, status);
  }

  @Post('work-orders')
  async createWorkOrder(@Request() req: AuthenticatedRequest, @Body() dto: CreateWorkOrderDto) {
    return this.customerService.createWorkOrder(req.user.sub, dto);
  }

  @Post('work-orders/photo')
  @UseInterceptors(FileInterceptor('photo', {
    storage: diskStorage({
      destination: (req: any, file: any, cb: Function) => {
        if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
      },
      filename: (req: any, file: any, cb: Function) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  }))
  async uploadFaultPhoto(@Request() req: AuthenticatedRequest, @UploadedFile() file: any) {
    if (!file) throw new NotFoundException('没有上传文件');
    const photoUrl = `/uploads/fault-photos/${file.filename}`;
    return { url: photoUrl };
  }

  @Get('work-orders/:id')
  async getWorkOrderDetail(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customerService.getWorkOrderDetail(req.user.sub, id);
  }

  @Post('work-orders/:id/cancel')
  async cancelWorkOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.customerService.cancelWorkOrder(req.user.sub, id, reason);
  }

  @Post('work-orders/:id/confirm')
  async confirmWorkOrder(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('confirm') confirm: boolean,
    @Body('refuseReason') refuseReason?: string,
  ) {
    return this.customerService.confirmWorkOrder(req.user.sub, id, confirm, refuseReason);
  }

  @Post('work-orders/:id/pay-prepayment')
  async payPrepayment(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customerService.payPrepayment(req.user.sub, id);
  }

  @Post('work-orders/:id/pay-final')
  async payFinalPayment(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customerService.payFinalPayment(req.user.sub, id);
  }

  // ==================== 评价 ====================
  @Post('reviews')
  async createReview(@Request() req: AuthenticatedRequest, @Body() dto: CreateReviewDto) {
    return this.customerService.createReview(req.user.sub, dto);
  }

  // ==================== 投诉 ====================
  @Post('complaints')
  async createComplaint(@Request() req: AuthenticatedRequest, @Body() dto: CreateComplaintDto) {
    return this.customerService.createComplaint(req.user.sub, dto);
  }

  @Post('refund')
  async applyRefund(@Request() req: AuthenticatedRequest, @Body() body: { workOrderId: string; amount: number; reason: string }) {
    return this.customerService.applyRefund(req.user.sub, body.workOrderId, body.amount, body.reason);
  }

  @Get('refund/:workOrderId')
  async getRefundStatus(@Request() req: AuthenticatedRequest, @Param('workOrderId') workOrderId: string) {
    const complaint = await this.customerService.getRefundStatus(req.user.sub, workOrderId);
    if (!complaint) throw new NotFoundException('退款申请不存在');
    return complaint;
  }
}
