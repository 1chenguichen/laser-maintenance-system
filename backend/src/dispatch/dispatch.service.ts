import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { DispatchRecord } from '../database/entities/dispatch-record.entity.js';
import { Notification } from '../database/entities/notification.entity.js';
import { EngineerStatus, WorkOrderStatus, DispatchType, UserType } from '../database/entities/enums.js';

@Injectable()
export class DispatchService {
  // WebSocket广播处理器
  private broadcastToEngineer: (engineerId: string, event: string, data: any) => void = () => {};
  private broadcastToCustomer: (customerId: string, event: string, data: any) => void = () => {};

  constructor(
    @InjectRepository(WorkOrder) private workOrderRepo: Repository<WorkOrder>,
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
    @InjectRepository(DispatchRecord) private dispatchRecordRepo: Repository<DispatchRecord>,
    @InjectRepository(Notification) private notificationRepo: Repository<Notification>,
  ) {}

  setBroadcastHandler(handler: (engineerId: string, event: string, data: any) => void) {
    this.broadcastToEngineer = handler;
  }

  setCustomerBroadcastHandler(handler: (customerId: string, event: string, data: any) => void) {
    this.broadcastToCustomer = handler;
  }

  // ==================== 系统派单 ====================
  async dispatchToGrabPool(workOrderId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    workOrder.status = WorkOrderStatus.PENDING;
    workOrder.dispatchType = DispatchType.SYSTEM;
    await this.workOrderRepo.save(workOrder);

    // 记录派单
    await this.saveDispatchRecord(workOrderId, null, DispatchType.SYSTEM, '系统派单池');

    // 通知所有在线工程师有新订单
    const onlineEngineers = await this.engineerRepo.find({ where: { status: EngineerStatus.ONLINE } });
    for (const engineer of onlineEngineers) {
      this.broadcastToEngineer(engineer.id, 'new_order', { workOrder });
      await this.createNotification(
        engineer.id,
        UserType.ENGINEER,
        'new_order',
        '新订单抢单',
        `您有新的维修订单等待抢单，故障类型: ${workOrder.faultType}`,
        workOrderId,
      );
    }

    return workOrder;
  }

  // ==================== 指定工程师派单 ====================
  async dispatchToEngineer(workOrderId: string, engineerId: string, csOperatorId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    const engineer = await this.engineerRepo.findOne({ where: { id: engineerId } });
    if (!engineer) throw new NotFoundException('工程师不存在');
    if (engineer.status === EngineerStatus.OFFLINE) {
      throw new BadRequestException('该工程师当前不在线');
    }

    workOrder.status = WorkOrderStatus.PENDING;
    workOrder.dispatchType = DispatchType.DESIGNATED;
    workOrder.designatedEngineerId = engineerId;
    workOrder.csOperatorId = csOperatorId;
    await this.workOrderRepo.save(workOrder);

    // 记录派单
    await this.saveDispatchRecord(workOrderId, engineerId, DispatchType.DESIGNATED, `客服 ${csOperatorId} 指定派单`);

    // 通知指定工程师
    this.broadcastToEngineer(engineerId, 'designated_order', { workOrder });
    await this.createNotification(
      engineerId,
      UserType.ENGINEER,
      'designated_order',
      '收到指定工单',
      `您收到一个指定的维修订单，故障类型: ${workOrder.faultType}，请及时处理`,
      workOrderId,
    );

    return workOrder;
  }

  // ==================== 派单记录 ====================
  async getDispatchRecords(workOrderId: string): Promise<DispatchRecord[]> {
    return this.dispatchRecordRepo.find({
      where: { workOrderId },
      order: { createdAt: 'DESC' },
    });
  }

  // ==================== 催单 ====================
  async remindEngineer(workOrderId: string): Promise<{ message: string }> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');
    if (!workOrder.engineerId) throw new BadRequestException('该工单暂无负责工程师');

    this.broadcastToEngineer(workOrder.engineerId, 'reminder', { workOrderId });
    await this.createNotification(
      workOrder.engineerId,
      UserType.ENGINEER,
      'reminder',
      '催单提醒',
      `客户催促您尽快处理工单 ${workOrder.orderNo}`,
      workOrderId,
    );

    return { message: '催单已发送' };
  }

  // ==================== 换人 ====================
  async reassignEngineer(workOrderId: string, newEngineerId: string, csOperatorId: string): Promise<WorkOrder> {
    const workOrder = await this.workOrderRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException('工单不存在');

    const oldEngineerId = workOrder.engineerId;
    const newEngineer = await this.engineerRepo.findOne({ where: { id: newEngineerId } });
    if (!newEngineer) throw new NotFoundException('新工程师不存在');

    workOrder.engineerId = newEngineerId;
    workOrder.designatedEngineerId = newEngineerId;
    workOrder.dispatchType = DispatchType.DESIGNATED;
    workOrder.csOperatorId = csOperatorId;
    await this.workOrderRepo.save(workOrder);

    // 记录换人
    await this.saveDispatchRecord(workOrderId, newEngineerId, DispatchType.DESIGNATED, `客服换人: ${oldEngineerId} -> ${newEngineerId}`);

    // 通知原工程师
    if (oldEngineerId) {
      await this.createNotification(
        oldEngineerId,
        UserType.ENGINEER,
        'reassigned',
        '工单被转移',
        `工单 ${workOrder.orderNo} 已被转移给其他工程师`,
        workOrderId,
      );
    }

    // 通知新工程师
    this.broadcastToEngineer(newEngineerId, 'new_order', { workOrder });
    await this.createNotification(
      newEngineerId,
      UserType.ENGINEER,
      'new_order',
      '收到新工单',
      `您收到一个维修订单，故障类型: ${workOrder.faultType}`,
      workOrderId,
    );

    return workOrder;
  }

  // ==================== 辅助方法 ====================
  private async saveDispatchRecord(
    workOrderId: string,
    engineerId: string | null,
    dispatchType: DispatchType,
    remark?: string,
  ): Promise<DispatchRecord> {
    const record = new DispatchRecord();
    record.workOrderId = workOrderId;
    record.engineerId = engineerId;
    record.dispatchType = dispatchType;
    record.remark = remark ?? null;
    record.grabTime = null;
    return this.dispatchRecordRepo.save(record);
  }

  private async createNotification(
    userId: string,
    userType: UserType,
    type: string,
    title: string,
    content: string,
    workOrderId?: string,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId,
      userType,
      type,
      title,
      content,
      workOrderId,
      isRead: false,
    });
    return this.notificationRepo.save(notification);
  }

  // ==================== 客户通知 ====================
  async notifyCustomerOrderDispatched(customerId: string, workOrder: WorkOrder): Promise<void> {
    this.broadcastToCustomer(customerId, 'order_dispatched', {
      workOrderId: workOrder.id,
      status: workOrder.status,
      faultType: workOrder.faultType,
    });
    await this.createNotification(
      customerId,
      UserType.CUSTOMER,
      'order_dispatched',
      '订单已派单',
      `您的订单已分配工程师，故障类型: ${workOrder.faultType}`,
      workOrder.id,
    );
  }

  async notifyCustomerOrderCompleted(customerId: string, workOrder: WorkOrder): Promise<void> {
    this.broadcastToCustomer(customerId, 'order_completed', {
      workOrderId: workOrder.id,
      status: workOrder.status,
    });
    await this.createNotification(
      customerId,
      UserType.CUSTOMER,
      'order_completed',
      '订单已完成',
      `您的订单已完成维修，感谢您的耐心等待`,
      workOrder.id,
    );
  }

  // ==================== 5分钟超时处理 ====================
  async handleTimeout(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // 找出5分钟内未响应的指派单
    const timeoutOrders = await this.workOrderRepo.find({
      where: {
        status: WorkOrderStatus.PENDING,
        dispatchType: DispatchType.DESIGNATED,
        createdAt: LessThan(fiveMinutesAgo),
      },
    });

    for (const order of timeoutOrders) {
      // 转为系统派单池
      order.dispatchType = DispatchType.SYSTEM;
      order.designatedEngineerId = '';
      await this.workOrderRepo.save(order);

      // 通知原工程师
      if (order.engineerId) {
        await this.createNotification(
          order.engineerId,
          UserType.ENGINEER,
          'timeout',
          '接单超时',
          `工单 ${order.orderNo} 接单超时，已重新放入派单池`,
          order.id,
        );
      }

      // 通知客户（可选）
      await this.createNotification(
        order.customerId,
        UserType.CUSTOMER,
        'timeout',
        '派单延迟',
        `工单 ${order.orderNo} 因工程师未及时接单，正在重新分配`,
        order.id,
      );
    }
  }
}
