import { ServiceContract } from '../database/entities/operations.entity.js';
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

  private addressFields(dto:CreateAddressDto):Partial<CreateAddressDto>{const value:any={};for(const key of ['province','city','district','detail','longitude','latitude','label','isDefault'])if((dto as any)[key]!==undefined)value[key]=(dto as any)[key];return value;}

  // ==================== 地址管理 ====================
  async getAddresses(customerId: string): Promise<Address[]> {
    return this.addressRepo.find({ where: { customerId }, order: { isDefault: 'DESC', createdAt: 'DESC' } });
  }

  async createAddress(customerId: string, dto: CreateAddressDto): Promise<Address> {
    if (dto.isDefault) {
      // 取消其他默认地址
      await this.addressRepo.update({ customerId, isDefault: true }, { isDefault: false });
    }
    const address = this.addressRepo.create({ ...this.addressFields(dto), customerId });
    return this.addressRepo.save(address);
  }

  async updateAddress(customerId: string, addressId: string, dto: CreateAddressDto): Promise<Address> {
    const address = await this.addressRepo.findOne({ where: { id: addressId, customerId } });
    if (!address) throw new NotFoundException('地址不存在');

    if (dto.isDefault) {
      await this.addressRepo.update({ customerId, isDefault: true }, { isDefault: false });
    }

    Object.assign(address, this.addressFields(dto));
    return this.addressRepo.save(address);
  }

  async deleteAddress(customerId: string, addressId: string): Promise<void> {
    if (await this.workOrderRepo.count({ where: { addressId, customerId } })) throw new BadRequestException('该地址已关联工单，请保留历史服务地址');
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

    if (device.customerId === customerId) return device;
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
    // Unbind instead of deleting the equipment and breaking historical orders.
    const result = await this.deviceRepo.update({ id: deviceId, customerId }, { customerId: null as any });
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

    let contract: ServiceContract | null = null;
    if (dto.contractId) {
      contract = await this.workOrderRepo.manager.findOneBy(ServiceContract, { id: dto.contractId, customerId, status: 'ACTIVE' });
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
      if (!contract || contract.startDate > today || contract.endDate < today || (contract.deviceIds.length && !contract.deviceIds.includes(device.id))) throw new BadRequestException('合同未生效、已到期或未覆盖该设备');
    }
    // 生成工单号
    const orderNo = `WX${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const workOrder = this.workOrderRepo.create({
      orderNo,
      contractId: contract?.id,
      contractTerms: contract ? { number: contract.number, laborIncluded: contract.laborIncluded, partsDiscount: Number(contract.partsDiscount) } : undefined,
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
    if (typeof confirm !== 'boolean') throw new BadRequestException('请明确确认或拒绝报价');
    return this.workOrderRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(WorkOrder);
      const order = await repo.findOne({ where: { id: workOrderId, customerId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException('工单不存在');
      if (order.status !== WorkOrderStatus.PENDING_PAYMENT || order.customerConfirm) throw new BadRequestException('当前状态不能确认报价');
      const total = Number(order.partsFee || 0) + Number(order.laborFee || 0);
      if (total < 0 || (total === 0 && !order.contractId)) throw new BadRequestException('工程师尚未提交有效报价');
      order.customerConfirm = confirm;
      if (confirm) { order.prepayAmount = Math.round(total * 30) / 100; if (total === 0) order.status = WorkOrderStatus.REPAIRING; }
      else { order.status = WorkOrderStatus.REFUSED; order.refuseReason = refuseReason || ''; }
      return repo.save(order);
    });
  }

  // Local demo payment: no third-party funds are charged by these endpoints.
  async payPrepayment(customerId: string, workOrderId: string): Promise<WorkOrder> {
    return this.workOrderRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(WorkOrder);
      const order = await repo.findOne({ where: { id: workOrderId, customerId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException('工单不存在');
      if (order.status !== WorkOrderStatus.PENDING_PAYMENT || !order.customerConfirm) throw new BadRequestException('请先确认报价，且勿重复支付');
      order.status = WorkOrderStatus.REPAIRING;
      return repo.save(order);
    });
  }

  async payFinalPayment(customerId: string, workOrderId: string): Promise<WorkOrder> {
    return this.workOrderRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(WorkOrder);
      const order = await repo.findOne({ where: { id: workOrderId, customerId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException('工单不存在');
      if (order.status !== WorkOrderStatus.PENDING_FINAL_PAYMENT) throw new BadRequestException('当前状态不需要支付尾款');
      const total = Number(order.finalAmount) || Number(order.partsFee || 0) + Number(order.laborFee || 0);
      order.finalPaymentAmount = Math.round((total - Number(order.prepayAmount || 0)) * 100) / 100;
      order.status = WorkOrderStatus.COMPLETED;
      if (order.engineerId) {
        await manager.getRepository(Engineer).createQueryBuilder().update().set({
          monthlyOrders: () => 'monthly_orders + 1', totalOrders: () => 'total_orders + 1',
          monthlyRevenue: () => 'monthly_revenue + :total', totalRevenue: () => 'total_revenue + :total',
        }).where('id = :id', { id: order.engineerId, total }).execute();
      }
      return repo.save(order);
    });
  }
  async createReview(customerId: string, dto: CreateReviewDto): Promise<Review> {
    return this.workOrderRepo.manager.transaction(async manager => {
      const orders = manager.getRepository(WorkOrder);
      const order = await orders.findOne({ where: { id: dto.workOrderId, customerId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException('工单不存在');
      if (order.status !== WorkOrderStatus.COMPLETED) throw new BadRequestException('只能对已完成的工单进行评价');
      if (order.reviewed) throw new BadRequestException('该工单已评价');
      const reviews = manager.getRepository(Review);
      const review = reviews.create({ workOrderId: order.id, customerId, engineerId: order.engineerId, rating: dto.rating, content: dto.content, tags: dto.tags, isAnonymous: dto.isAnonymous || false });
      await reviews.save(review);
      order.reviewed = true;
      await orders.save(order);
      return review;
    });
  }

  // ==================== 投诉 ====================
  async createComplaint(customerId: string, dto: CreateComplaintDto): Promise<Complaint> {
    if (dto.workOrderId) await this.getWorkOrderDetail(customerId, dto.workOrderId);
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

    if (![WorkOrderStatus.REPAIRING, WorkOrderStatus.PENDING_FINAL_PAYMENT, WorkOrderStatus.COMPLETED].includes(workOrder.status)) throw new BadRequestException('该工单尚未支付，无法申请退款');
    const paid = Number(workOrder.prepayAmount || 0) + Number(workOrder.finalPaymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount > paid) throw new BadRequestException('退款金额必须大于0且不能超过已支付金额');
    if (await this.complaintRepo.findOne({ where: { workOrderId, customerId, complaintType: ComplaintType.REFUND, status: ComplaintStatus.PENDING } })) throw new BadRequestException('该工单已有待处理退款申请');
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
