import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Engineer } from '../database/entities/engineer.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { EngineerStatus, WorkOrderStatus, DispatchType } from '../database/entities/enums.js';
import { UpdateStatusDto, UpdateLocationDto, GrabOrderDto, AcceptDesignatedOrderDto, CompleteOrderDto, QuoteOrderDto } from './engineer.dto.js';
import { DispatchService } from '../dispatch/dispatch.service.js';

@Injectable()
export class EngineerService {
  // 模拟工程师位置存储（生产环境用Redis）
  private engineerLocations = new Map<string, { longitude: number; latitude: number; address?: string; updatedAt: number }>();

  constructor(
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
    @InjectRepository(WorkOrder) private workOrderRepo: Repository<WorkOrder>,
    private dispatchService: DispatchService,
  ) {}

  // ==================== 状态管理 ====================
  async updateStatus(engineerId: string, dto: UpdateStatusDto): Promise<Engineer> {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');

    engineer.status = dto.status;
    return this.engineerRepo.save(engineer);
  }

  async getStatus(engineerId: string): Promise<Engineer> {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');
    return engineer;
  }

  // ==================== 位置更新 ====================
  async updateLocation(engineerId: string, dto: UpdateLocationDto): Promise<{ message: string }> {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');

    this.engineerLocations.set(engineerId, {
      longitude: dto.longitude,
      latitude: dto.latitude,
      address: dto.address,
      updatedAt: Date.now(),
    });

    return { message: '位置更新成功' };
  }

  async getLocation(engineerId: string): Promise<{ longitude: number; latitude: number; address?: string } | null> {
    return this.engineerLocations.get(engineerId) || null;
  }

  // ==================== 订单池 ====================
  async getGrabPool(engineerId: string): Promise<WorkOrder[]> {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');

    // 获取所有可抢订单
    const orders = await this.workOrderRepo.find({
      where: {
        status: WorkOrderStatus.PENDING,
        dispatchType: DispatchType.SYSTEM,
      },
      relations: { device: true, address: true, customer: true } as any,
    });

    // 排序：紧急工单（>=3）排在前，非紧急在后，各自按创建时间 DESC（最新在前）
    return orders.sort((a, b) => {
      const aUrgent = a.emergencyLevel >= 3;
      const bUrgent = b.emergencyLevel >= 3;
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  // ==================== 抢单 ====================
  async grabOrder(engineerId: string, dto: GrabOrderDto): Promise<WorkOrder> {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');
    if (engineer.status !== EngineerStatus.ONLINE) {
      throw new BadRequestException('当前状态无法抢单');
    }

    const workOrder = await this.workOrderRepo.findOne({
      where: { id: dto.workOrderId, status: WorkOrderStatus.PENDING, dispatchType: DispatchType.SYSTEM },
    });
    if (!workOrder) throw new NotFoundException('工单不存在或已被抢');

    const customerId = workOrder.customerId;
    workOrder.engineerId = engineerId;
    workOrder.status = WorkOrderStatus.DISPATCHED;
    workOrder.dispatchType = DispatchType.GRAB;

    const savedOrder = await this.workOrderRepo.save(workOrder);

    // 通知客户订单已被抢
    this.dispatchService.notifyCustomerOrderDispatched(customerId, savedOrder);

    return savedOrder;
  }

  // ==================== 指派单处理 ====================
  async getDesignatedOrders(engineerId: string): Promise<WorkOrder[]> {
    return this.workOrderRepo.find({
      where: {
        designatedEngineerId: engineerId,
        status: WorkOrderStatus.PENDING,
        dispatchType: DispatchType.DESIGNATED,
      },
      relations: { device: true, address: true, customer: true } as any,
      order: { createdAt: 'ASC' },
    });
  }

  async acceptDesignatedOrder(engineerId: string, dto: AcceptDesignatedOrderDto): Promise<WorkOrder> {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');
    if (engineer.status === EngineerStatus.OFFLINE) {
      throw new BadRequestException('请先上线再接单');
    }

    const workOrder = await this.workOrderRepo.findOne({
      where: {
        id: dto.workOrderId,
        designatedEngineerId: engineerId,
        status: WorkOrderStatus.PENDING,
      },
    });
    if (!workOrder) throw new NotFoundException('工单不存在或已被接');

    workOrder.engineerId = engineerId;
    workOrder.status = WorkOrderStatus.DISPATCHED;

    return this.workOrderRepo.save(workOrder);
  }

  async refuseDesignatedOrder(engineerId: string, workOrderId: string, reason: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, designatedEngineerId: engineerId, status: WorkOrderStatus.PENDING },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');

    // 转为系统派单池
    workOrder.dispatchType = DispatchType.SYSTEM;
    workOrder.designatedEngineerId = '';

    return this.workOrderRepo.save(workOrder);
  }

  // ==================== 我的订单 ====================
  async getMyOrders(engineerId: string, status?: WorkOrderStatus): Promise<WorkOrder[]> {
    const where: any = { engineerId };
    if (status) where.status = status;

    return this.workOrderRepo.find({
      where,
      relations: { device: true, address: true, customer: true } as any,
      order: { createdAt: 'DESC' },
    });
  }

  async getOrderDetail(engineerId: string, workOrderId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, engineerId },
      relations: { device: true, address: true, customer: true, maintenanceRecord: true } as any,
    });
    if (!workOrder) throw new NotFoundException('工单不存在');
    return workOrder;
  }

  // ==================== 开始服务 ====================
  async startService(engineerId: string, workOrderId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, engineerId, status: WorkOrderStatus.DISPATCHED },
    });
    if (!workOrder) throw new NotFoundException('工单不存在或状态不允许');

    workOrder.status = WorkOrderStatus.ACCEPTED;

    // 更新工程师状态为工作中
    await this.engineerRepo.update(engineerId, { status: EngineerStatus.WORKING });

    return this.workOrderRepo.save(workOrder);
  }

  // ==================== 完成服务 ====================
  async completeOrder(engineerId: string, workOrderId: string, dto: CompleteOrderDto): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, engineerId, status: WorkOrderStatus.REPAIRING },
    });
    if (!workOrder) throw new NotFoundException('工单不存在或状态不允许（需要先支付定金）');

    // 使用报价时已确定的费用
    const totalAmount = Number(workOrder.partsFee || 0) + Number(workOrder.laborFee || 0);

    // 状态变为待付尾款（不是立即完成）
    workOrder.status = WorkOrderStatus.PENDING_FINAL_PAYMENT;
    workOrder.finalAmount = totalAmount;
    workOrder.onSitePhotos = dto.onSitePhotos ?? [];
    workOrder.signatureUrl = dto.signatureUrl ?? '';
    workOrder.repairReport = dto.repairReport ?? '';
    workOrder.completedAt = new Date();

    // 恢复工程师在线状态
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (engineer) {
      engineer.status = EngineerStatus.ONLINE;
      await this.engineerRepo.save(engineer);
    }

    return this.workOrderRepo.save(workOrder);
  }

  // ==================== 收益统计 ====================
  async getStats(engineerId: string) {
    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');

    // 计算当月订单确定提成比例
    const orderCount = engineer.monthlyOrders;
    let commissionRate: number;
    if (orderCount <= 10) {
      commissionRate = 0.20;
    } else if (orderCount <= 30) {
      commissionRate = 0.25;
    } else {
      commissionRate = 0.30;
    }

    const commissionAmount = Number(engineer.monthlyRevenue) * commissionRate;

    // 计算下个等级还差多少单
    let nextTier = null;
    if (orderCount < 10) {
      nextTier = { threshold: 10, rate: 0.25, remaining: 10 - orderCount };
    } else if (orderCount < 30) {
      nextTier = { threshold: 30, rate: 0.30, remaining: 30 - orderCount };
    }

    return {
      currentMonth: {
        orderCount,
        revenue: Number(engineer.monthlyRevenue),
        commissionRate,
        commissionAmount,
        avgRating: Number(engineer.rating),
      },
      commissionTiers: [
        { range: '1-10单', rate: '20%', nextTier: orderCount < 10 ? '11-30单 25%' : null },
        { range: '11-30单', rate: '25%', nextTier: orderCount >= 10 && orderCount < 30 ? '31+单 30%' : null },
        { range: '31+单', rate: '30%', nextTier: null },
      ],
      nextTier,
      history: {
        totalOrders: engineer.totalOrders,
        totalRevenue: Number(engineer.totalRevenue),
        avgRating: Number(engineer.rating),
      },
    };
  }

  // ==================== 提交报价 ====================
  async quoteOrder(engineerId: string, workOrderId: string, dto: QuoteOrderDto): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, engineerId, status: WorkOrderStatus.ACCEPTED },
    });
    if (!workOrder) throw new NotFoundException('工单不存在或状态不允许');

    // 记录报价信息
    workOrder.partsFee = dto.partsFee;
    workOrder.laborFee = dto.laborFee;
    workOrder.estimatedAmount = dto.partsFee + dto.laborFee;

    // 状态变为等待客户付款
    workOrder.status = WorkOrderStatus.PENDING_PAYMENT;

    return this.workOrderRepo.save(workOrder);
  }

  // ==================== 上传照片 ====================
  async uploadPhoto(engineerId: string, workOrderId: string, photoUrl: string, type: string): Promise<{ message: string }> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, engineerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');

    // 根据类型存储照片
    if (type === 'check_in') {
      workOrder.onSitePhotos = [...(workOrder.onSitePhotos || []), photoUrl];
    } else if (type === 'signature') {
      workOrder.signatureUrl = photoUrl;
    }

    await this.workOrderRepo.save(workOrder);
    return { message: '上传成功' };
  }
}
