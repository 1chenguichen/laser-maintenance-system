import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../database/entities/customer.entity.js';
import { Address } from '../database/entities/address.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Review } from '../database/entities/review.entity.js';
import { Complaint } from '../database/entities/complaint.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { WorkOrderStatus, DispatchType, ComplaintType, ComplaintStatus } from '../database/entities/enums.js';
import { CreateAddressDto, CreateDeviceDto, CreateWorkOrderDto, CreateReviewDto, CreateComplaintDto } from './customer.dto.js';
import { DispatchService } from '../dispatch/dispatch.service.js';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Address) private addressRepo: Repository<Address>,
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    @InjectRepository(WorkOrder) private workOrderRepo: Repository<WorkOrder>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Complaint) private complaintRepo: Repository<Complaint>,
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
    private dispatchService: DispatchService,
  ) {}

  // ==================== 地址管理 ====================
  async getAddresses(customerId: string): Promise<Address[]> {
    return this.addressRepo.find({ where: { customerId }, order: { isDefault: 'DESC', createdAt: 'DESC' } });
  }

  async createAddress(customerId: string, dto: CreateAddressDto): Promise<Address> {
    if (dto.isDefault) {
      // 取消其他默认地址
      await this.addressRepo.update({ customerId, isDefault: true }, { isDefault: false });
    }
    const address = this.addressRepo.create({ ...dto, customerId });
    return this.addressRepo.save(address);
  }

  async updateAddress(customerId: string, addressId: string, dto: CreateAddressDto): Promise<Address> {
    const address = await this.addressRepo.findOne({ where: { id: addressId, customerId } });
    if (!address) throw new NotFoundException('地址不存在');

    if (dto.isDefault) {
      await this.addressRepo.update({ customerId, isDefault: true }, { isDefault: false });
    }

    Object.assign(address, dto);
    return this.addressRepo.save(address);
  }

  async deleteAddress(customerId: string, addressId: string): Promise<void> {
    const result = await this.addressRepo.delete({ id: addressId, customerId });
    if (result.affected === 0) throw new NotFoundException('地址不存在');
  }

  // ==================== 设备管理 ====================
  async getDevices(customerId: string): Promise<Device[]> {
    return this.deviceRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async createDevice(customerId: string, dto: CreateDeviceDto): Promise<Device> {
    // 清理序列号中的空白字符
    const serialNumber = dto.serialNumber.trim().replace(/\s+/g, '');

    // 查找设备（不管是否已绑定客户）
    const device = await this.deviceRepo.findOne({ where: { serialNumber } });

    if (!device) {
      throw new BadRequestException('该设备不存在，请联系客服添加设备后再绑定');
    }

    if (device.customerId) {
      throw new BadRequestException('该设备已被其他客户绑定');
    }

    // 绑定到当前客户
    device.customerId = customerId;
    return this.deviceRepo.save(device);
  }

  async getDeviceBySerial(serialNumber: string): Promise<Device | null> {
    return this.deviceRepo.findOne({ where: { serialNumber } });
  }

  async deleteDevice(customerId: string, deviceId: string): Promise<void> {
    const result = await this.deviceRepo.delete({ id: deviceId, customerId });
    if (result.affected === 0) throw new NotFoundException('设备不存在');
  }

  // ==================== 工单管理 ====================
  async getWorkOrders(customerId: string, status?: WorkOrderStatus): Promise<WorkOrder[]> {
    const where: any = { customerId };
    if (status) where.status = status;
    return this.workOrderRepo.find({
      where,
      relations: { device: true, address: true, engineer: true } as any,
      order: { createdAt: 'DESC' },
    });
  }

  async createWorkOrder(customerId: string, dto: CreateWorkOrderDto): Promise<WorkOrder> {
    // 验证设备和地址属于该客户
    const device = await this.deviceRepo.findOne({ where: { id: dto.deviceId, customerId } });
    if (!device) throw new NotFoundException('设备不存在');

    const address = await this.addressRepo.findOne({ where: { id: dto.addressId, customerId } });
    if (!address) throw new NotFoundException('地址不存在');

    // 生成工单号
    const orderNo = `WX${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const workOrder = this.workOrderRepo.create({
      orderNo,
      customerId,
      deviceId: dto.deviceId,
      addressId: dto.addressId,
      faultType: dto.faultType,
      faultDescription: dto.faultDescription,
      faultPhotos: dto.faultPhotos,
      emergencyLevel: dto.emergencyLevel ?? 0,
      status: WorkOrderStatus.PENDING,
      dispatchType: dto.hasPreferredEngineer ? DispatchType.DESIGNATED : DispatchType.SYSTEM,
      designatedEngineerId: dto.preferredEngineerId,
      estimatedAmount: 0, // TODO: 根据故障类型估算
    });

    const savedOrder = await this.workOrderRepo.save(workOrder);

    // 自动派发到抢单池
    if (savedOrder.dispatchType === DispatchType.SYSTEM) {
      await this.dispatchService.dispatchToGrabPool(savedOrder.id);
    }

    return savedOrder;
  }

  async getWorkOrderDetail(customerId: string, workOrderId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, customerId },
      relations: { device: true, address: true, engineer: true, maintenanceRecord: true, review: true } as any,
    });
    if (!workOrder) throw new NotFoundException('工单不存在');
    return workOrder;
  }

  async cancelWorkOrder(customerId: string, workOrderId: string, reason?: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, customerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');
    if (workOrder.status !== WorkOrderStatus.PENDING && workOrder.status !== WorkOrderStatus.DISPATCHED) {
      throw new BadRequestException('当前状态无法取消');
    }

    workOrder.status = WorkOrderStatus.CANCELLED;
    workOrder.refuseReason = reason ?? '';
    return this.workOrderRepo.save(workOrder);
  }

  async confirmWorkOrder(customerId: string, workOrderId: string, confirm: boolean, refuseReason?: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, customerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');

    console.log('=== confirmWorkOrder called ===');
    console.log('confirm value:', confirm, typeof confirm);
    console.log('workOrder id:', workOrderId);

    if (confirm) {
      // 客户确认报价，状态变为待支付定金
      workOrder.status = WorkOrderStatus.PENDING_PAYMENT;
      workOrder.customerConfirm = true;
      // 计算定金金额（30%）
      const totalAmount = Number(workOrder.partsFee || 0) + Number(workOrder.laborFee || 0);
      workOrder.prepayAmount = totalAmount * 0.3;
      console.log('Setting status to PENDING_PAYMENT, prepayAmount:', workOrder.prepayAmount);
    } else {
      workOrder.status = WorkOrderStatus.REFUSED;
      workOrder.refuseReason = refuseReason ?? '';
    }

    return this.workOrderRepo.save(workOrder);
  }

  // ==================== 支付定金 ====================
  async payPrepayment(customerId: string, workOrderId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, customerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');
    if (workOrder.status !== WorkOrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('当前状态不需要支付定金');
    }

    // 支付定金后，状态变为维修中
    workOrder.status = WorkOrderStatus.REPAIRING;
    return this.workOrderRepo.save(workOrder);
  }

  // ==================== 支付尾款 ====================
  async payFinalPayment(customerId: string, workOrderId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, customerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');
    if (workOrder.status !== WorkOrderStatus.PENDING_FINAL_PAYMENT) {
      throw new BadRequestException('当前状态不需要支付尾款');
    }

    // 计算尾款（70%）
    const totalAmount = Number(workOrder.finalAmount) || (Number(workOrder.partsFee || 0) + Number(workOrder.laborFee || 0));
    workOrder.finalPaymentAmount = totalAmount * 0.7;
    workOrder.status = WorkOrderStatus.COMPLETED;

    // 更新工程师统计（只有在收到尾款后才计入）
    const engineer = await this.engineerRepo.findOne({ where: { id: workOrder.engineerId } });
    if (engineer) {
      engineer.monthlyOrders += 1;
      engineer.monthlyRevenue = Number(engineer.monthlyRevenue) + totalAmount;
      engineer.totalOrders += 1;
      engineer.totalRevenue = Number(engineer.totalRevenue) + totalAmount;
      await this.engineerRepo.save(engineer);
    }

    return this.workOrderRepo.save(workOrder);
  }
  async createReview(customerId: string, dto: CreateReviewDto): Promise<Review> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: dto.workOrderId, customerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');
    if (workOrder.status !== WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('只能对已完成的工单进行评价');
    }

    const review = this.reviewRepo.create({
      workOrderId: dto.workOrderId,
      customerId,
      engineerId: workOrder.engineerId,
      rating: dto.rating,
      content: dto.content,
      tags: dto.tags,
      isAnonymous: dto.isAnonymous || false,
    });

    // 标记工单已评价
    workOrder.reviewed = true;
    await this.workOrderRepo.save(workOrder);

    return this.reviewRepo.save(review);
  }

  // ==================== 投诉 ====================
  async createComplaint(customerId: string, dto: CreateComplaintDto): Promise<Complaint> {
    const complaint = this.complaintRepo.create({
      workOrderId: dto.workOrderId,
      customerId,
      complaintType: dto.complaintType as ComplaintType,
      level: dto.level,
      refundAmount: dto.refundAmount,
      content: dto.content,
      status: ComplaintStatus.PENDING,
    });

    return this.complaintRepo.save(complaint);
  }

  // ==================== 退款 ====================
  async applyRefund(customerId: string, workOrderId: string, amount: number, reason: string): Promise<Complaint> {
    const workOrder = await this.workOrderRepo.findOne({
      where: { id: workOrderId, customerId },
    });
    if (!workOrder) throw new NotFoundException('工单不存在');

    // 创建退款投诉
    const complaint = this.complaintRepo.create({
      workOrderId,
      customerId,
      complaintType: ComplaintType.REFUND,
      refundAmount: amount,
      content: reason,
      status: ComplaintStatus.PENDING,
    });

    return this.complaintRepo.save(complaint);
  }

  async getRefundStatus(customerId: string, workOrderId: string): Promise<Complaint | null> {
    return this.complaintRepo.findOne({
      where: { workOrderId, customerId, complaintType: ComplaintType.REFUND },
    });
  }
}
