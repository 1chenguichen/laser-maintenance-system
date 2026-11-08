import {networkInterfaces} from 'node:os';
import { indexPerson,indexAsset } from '../identity/store.js';
import { currentTenant } from '../tenancy/context.js';
import { registry } from '../tenancy/registry.js';
import { Roles } from '../auth/roles.decorator.js';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { EngineerStatus, ComplaintStatus, DispatchType } from '../database/entities/enums.js';
import { Customer } from '../database/entities/customer.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { Part } from '../database/entities/part.entity.js';
import { Address } from '../database/entities/address.entity.js';
import { WorkOrderStatus } from '../database/entities/enums.js';
import { Complaint } from '../database/entities/complaint.entity.js';
import { Review } from '../database/entities/review.entity.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/types.js';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('cs_operator')
export class AdminController {
  constructor(
    @InjectRepository(WorkOrder) private workOrderRepo: Repository<WorkOrder>,
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    @InjectRepository(Part) private partRepo: Repository<Part>,
    @InjectRepository(Address) private addressRepo: Repository<Address>,
    @InjectRepository(Complaint) private complaintRepo: Repository<Complaint>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
  ) {}

  // ==================== 工单管理 ====================
  @Get('work-orders')
  async getAllWorkOrders(@Query('status') status?: string) {
    const where: any = {};
    if (status && status !== '全部') where.status = status;
    return this.workOrderRepo.find({
      where,
      relations: { device: true, address: true, engineer: true, customer: true } as any,
      order: { createdAt: 'DESC' },
    });
  }

  @Get('work-orders/:id')
  async getWorkOrderDetail(@Param('id') id: string) {
    const order = await this.workOrderRepo.findOne({
      where: { id },
      relations: { device: true, address: true, engineer: true, customer: true } as any,
    });
    if (!order) throw new NotFoundException('工单不存在');
    return order;
  }

  @Put('work-orders/:id/classify')
  async classifyWorkOrder(
    @Param('id') id: string,
    @Body() body: {
      faultType: string;
      emergencyLevel: number;
      estimatedAmount: number;
      dispatchType: string;
      designatedEngineerId?: string;
      csOperatorId?: string;
    },
  ) {
    const workOrder = await this.workOrderRepo.findOne({ where: { id } });
    if (!workOrder) throw new Error('工单不存在');

    if (workOrder.status !== WorkOrderStatus.PENDING) throw new BadRequestException('仅待派单工单可修改派单分类');
    if (![DispatchType.SYSTEM, DispatchType.DESIGNATED].includes(body.dispatchType as DispatchType)) throw new BadRequestException('派单方式无效');
    if (!Number.isFinite(body.estimatedAmount) || body.estimatedAmount < 0) throw new BadRequestException('预估金额无效');
    if (body.dispatchType === DispatchType.DESIGNATED) {
      if (!body.designatedEngineerId || !await this.engineerRepo.findOneBy({ id: body.designatedEngineerId })) throw new BadRequestException('请选择有效的指定工程师');
    }
    workOrder.faultType = body.faultType;
    workOrder.emergencyLevel = body.emergencyLevel;
    workOrder.estimatedAmount = body.estimatedAmount;
    workOrder.dispatchType = body.dispatchType as DispatchType;
    workOrder.designatedEngineerId = body.dispatchType === DispatchType.DESIGNATED ? body.designatedEngineerId! : null as any;

    return this.workOrderRepo.save(workOrder);
  }

  @Post('work-orders/:id/dispatch')
  async dispatchWorkOrder(@Param('id') id: string, @Body('engineerId') engineerId: string) {
    const workOrder = await this.workOrderRepo.findOne({ where: { id } });
    if (!workOrder) throw new Error('工单不存在');

    if (workOrder.status !== WorkOrderStatus.PENDING) throw new BadRequestException('当前工单不可重新派单');
    if (!await this.engineerRepo.findOneBy({ id: engineerId })) throw new BadRequestException('工程师不存在');
    workOrder.engineerId = engineerId;
    workOrder.status = WorkOrderStatus.DISPATCHED;
    return this.workOrderRepo.save(workOrder);
  }

  @Delete('work-orders/:id')
  async deleteWorkOrder(@Param('id') id: string) {
    await this.workOrderRepo.manager.transaction(async manager => {
      const movements = await manager.query('SELECT 1 FROM stock_movements WHERE work_order_id = $1 LIMIT 1', [id]);
      if (movements.length) throw new BadRequestException('工单已有用料流水，请保留以便对账');
      for (const table of ['reviews', 'complaints', 'service_chats', 'maintenance_records', 'dispatch_records', 'notifications']) {
        await manager.query(`DELETE FROM ${table} WHERE work_order_id = $1`, [id]);
      }
      await manager.query('DELETE FROM work_orders WHERE id = $1', [id]);
    });
    return { message: '删除成功' };
  }

  // ==================== 工程师管理 ====================
  @Get('engineers')
  async getEngineers() {
    return this.engineerRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Get('engineers/:id')
  async getEngineerDetail(@Param('id') id: string) {
    const engineer = await this.engineerRepo.findOne({ where: { id } });
    if (!engineer) throw new Error('工程师不存在');
    return engineer;
  }

  @Get('engineers/:id/stats')
  async getEngineerStats(@Param('id') id: string) {
    const engineer = await this.engineerRepo.findOne({ where: { id } });
    if (!engineer) throw new Error('工程师不存在');

    const orderCount = engineer.monthlyOrders;
    let commissionRate: number;
    if (orderCount <= 10) commissionRate = 0.20;
    else if (orderCount <= 30) commissionRate = 0.25;
    else commissionRate = 0.30;

    return {
      monthlyOrders: engineer.monthlyOrders,
      monthlyRevenue: engineer.monthlyRevenue,
      commissionRate,
      totalOrders: engineer.totalOrders,
      totalRevenue: engineer.totalRevenue,
      rating: engineer.rating,
      status: engineer.status,
    };
  }

  @Post('engineers')
  async createEngineer(@Body() body: { name: string; phone: string }) {
    const client=await registry.connect();
    try {
      await client.query('BEGIN');
      const tenant=(await client.query('SELECT employee_limit FROM platform.tenants WHERE id=$1 FOR UPDATE',[currentTenant().id])).rows[0];
      const admins=(await client.query("SELECT count(*)::int AS count FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator'",[currentTenant().id])).rows[0].count;
      const engineer=await this.engineerRepo.manager.transaction(async manager=>{
        const count=await manager.count(Engineer);
        if(count+admins>=tenant.employee_limit)throw new BadRequestException('企业员工额度已用完，请联系平台管理员扩容');
        return manager.save(Engineer,manager.create(Engineer,{name:body.name,phone:body.phone,status:EngineerStatus.OFFLINE,joinedAt:new Date()}));
      });
      await client.query('COMMIT');
      await indexPerson(currentTenant().id,'engineer',engineer.id,engineer.phone,engineer.name);
      return engineer;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  // ==================== 客户管理 ====================
  @Get('customers')
  async getCustomers() {
    return this.customerRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Post('customers')
  async createCustomer(@Body() body: { name?: string; phone?: string }) {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!name || name.length > 50) throw new BadRequestException('客户姓名为必填项，最多50个字符');
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new BadRequestException('请输入有效的11位手机号码');
    try {
      return await this.customerRepo.manager.transaction(async manager => {
        if (await manager.findOne(Customer, { where: { phone } })) throw new BadRequestException('该手机号已在本企业客户列表中');
        const customer = await manager.save(Customer, manager.create(Customer, { name, phone }));
        await indexPerson(currentTenant().id, 'customer', customer.id, customer.phone, customer.name);
        return customer;
      });
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') throw new BadRequestException('该手机号已在本企业客户列表中');
      throw error;
    }
  }

  @Get('customers/:id')
  async getCustomerDetail(@Param('id') id: string) {
    const customer = await this.customerRepo.findOne({ where: { id } });
    if (!customer) throw new Error('客户不存在');

    const addresses = await this.addressRepo.find({ where: { customerId: id } });
    const devices = await this.deviceRepo.find({ where: { customerId: id } });
    const workOrders = await this.workOrderRepo.find({
      where: { customerId: id },
      relations: { device: true, engineer: true } as any,
      order: { createdAt: 'DESC' },
    });

    return {
      ...customer,
      addresses,
      devices,
      workOrders,
    };
  }

  @Put('customers/:id')
  async updateCustomer(@Param('id') id: string, @Body() body: { name?: string; phone?: string }) {
    const customer = await this.customerRepo.findOne({ where: { id } });
    if (!customer) throw new Error('客户不存在');

    if (body.name) customer.name = body.name;
    if (body.phone) customer.phone = body.phone;

    const saved=await this.customerRepo.save(customer);
    await indexPerson(currentTenant().id,'customer',saved.id,saved.phone,saved.name);
    return saved;
  }

  // ==================== 设备管理 ====================
  @Get('devices')
  async getDevices() {
    return this.deviceRepo.find({
      relations: { customer: true } as any,
      order: { createdAt: 'DESC' },
    });
  }

  @Get('devices/:id')
  async getDeviceDetail(@Param('id') id: string) {
    return this.deviceRepo.findOne({
      where: { id },
      relations: { customer: true } as any,
    });
  }

  @Post('devices')
  async createDevice(@Body() body: {
    serialNumber: string;
    model: string;
    deviceType: string;
    customerId?: string;
    purchaseDate?: string;
    warrantyExpire?: string;
  }) {
    // 清理序列号中的空白字符
    const serialNumber = body.serialNumber.trim().replace(/\s+/g, '');

    // 检查序列号是否已存在
    const exists = await this.deviceRepo.findOne({ where: { serialNumber } });
    if (exists) throw new BadRequestException('该序列号已存在，请勿重复添加');

    const device = new Device();
    device.customerId = body.customerId || null;
    device.serialNumber = serialNumber;
    device.model = body.model;
    device.deviceType = body.deviceType;
    device.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) as any : null;
    device.warrantyExpire = body.warrantyExpire ? new Date(body.warrantyExpire) as any : null;
    const saved=await this.deviceRepo.save(device);
    await indexAsset(currentTenant().id,saved.id,saved.serialNumber);
    return saved;
  }

  @Get('devices/:id/claim-link')
  async deviceClaimLink(@Param('id') id:string,@Request() req:any){
    const device=await this.deviceRepo.findOneBy({id});if(!device)throw new NotFoundException('设备不存在');
    const tenant=currentTenant(),asset=await indexAsset(tenant.id,device.id,device.serialNumber);
    const localHost=['localhost','127.0.0.1','::1'].includes(req.hostname);
    const lan=Object.entries(networkInterfaces()).filter(([name])=>!/virtual|vethernet|wsl|vpn|docker|loopback/i.test(name)).flatMap(([,items])=>items||[]).find(i=>i.family==='IPv4'&&!i.internal);
    return {assetKey:asset.id,path:'/device-scan.html?asset='+asset.id,companyName:tenant.name,customerBaseUrl:process.env.CUSTOMER_WEB_URL||(localHost&&lan?'http://'+lan.address+':4101':req.protocol+'://'+req.hostname+':3101')};
  }

  @Put('devices/:id')
  async updateDevice(@Param('id') id: string, @Body() body: {
    model?: string;
    deviceType?: string;
    customerId?: string;
    purchaseDate?: string;
    warrantyExpire?: string;
  }) {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new Error('设备不存在');

    // 序列号不允许修改，只更新其他字段
    if (body.model) device.model = body.model;
    if (body.deviceType) device.deviceType = body.deviceType;
    if (body.customerId !== undefined) device.customerId = body.customerId || null;
    if (body.purchaseDate) device.purchaseDate = new Date(body.purchaseDate) as any;
    if (body.warrantyExpire) device.warrantyExpire = new Date(body.warrantyExpire) as any;

    const saved=await this.deviceRepo.save(device);
    await indexAsset(currentTenant().id,saved.id,saved.serialNumber);
    return saved;
  }

  // ==================== 配件管理 ====================
  @Get('parts')
  async getParts() {
    return this.partRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Post('parts')
  async createPart(@Body() body: {
    code: string;
    name: string;
    category: string;
    unit: string;
    guidePrice: number;
  }) {
    const part = this.partRepo.create({
      code: body.code,
      name: body.name,
      category: body.category,
      unit: body.unit,
      guidePrice: body.guidePrice,
      isActive: true,
    });
    return this.partRepo.save(part);
  }

  // ==================== 客服统计 ====================
  @Get('stats')
  async getStats() {
    const totalOrders = await this.workOrderRepo.count();
    const pendingOrders = await this.workOrderRepo.count({ where: { status: WorkOrderStatus.PENDING } });
    const completedOrders = await this.workOrderRepo.count({ where: { status: WorkOrderStatus.COMPLETED } });
    const totalEngineers = await this.engineerRepo.count();
    const totalCustomers = await this.customerRepo.count();

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalEngineers,
      totalCustomers,
    };
  }

  // ==================== 运营数据统计 ====================
  @Get('stats/trend')
  async getTrendStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayOrders, weekOrders, monthOrders, completedToday, completedWeek, completedMonth] = await Promise.all([
      this.workOrderRepo.createQueryBuilder('wo').where('wo.createdAt >= :date', { date: todayStart }).getCount(),
      this.workOrderRepo.createQueryBuilder('wo').where('wo.createdAt >= :date', { date: weekStart }).getCount(),
      this.workOrderRepo.createQueryBuilder('wo').where('wo.createdAt >= :date', { date: monthStart }).getCount(),
      this.workOrderRepo.createQueryBuilder('wo').where('wo.status = :status AND wo.completedAt >= :date', { status: WorkOrderStatus.COMPLETED, date: todayStart }).getCount(),
      this.workOrderRepo.createQueryBuilder('wo').where('wo.status = :status AND wo.completedAt >= :date', { status: WorkOrderStatus.COMPLETED, date: weekStart }).getCount(),
      this.workOrderRepo.createQueryBuilder('wo').where('wo.status = :status AND wo.completedAt >= :date', { status: WorkOrderStatus.COMPLETED, date: monthStart }).getCount(),
    ]);

    return {
      todayOrders,
      weekOrders,
      monthOrders,
      completedToday,
      completedWeek,
      completedMonth,
    };
  }

  @Get('stats/performance')
  async getPerformanceStats() {
    const totalOrders = await this.workOrderRepo.count();
    const completedOrders = await this.workOrderRepo.count({ where: { status: WorkOrderStatus.COMPLETED } });

    // 计算平均维修时长（从派单到完成）
    const completedWorkOrders = await this.workOrderRepo.find({
      where: { status: WorkOrderStatus.COMPLETED },
    });

    let avgRepairHours = 0;
    if (completedWorkOrders.length > 0) {
      const totalHours = completedWorkOrders.reduce((sum: number, wo: any) => {
        if (wo.completedAt && wo.createdAt) {
          const hours = (new Date(wo.completedAt).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }
        return sum;
      }, 0);
      avgRepairHours = Math.round(totalHours / completedWorkOrders.length * 10) / 10;
    }

    return {
      completionRate: totalOrders > 0 ? Math.round(completedOrders / totalOrders * 100) : 0,
      avgRepairHours,
      totalCompleted: completedOrders,
    };
  }

  @Get('stats/engineers/ranking')
  async getEngineerRanking() {
    const engineers = await this.engineerRepo.find({
      order: { monthlyRevenue: 'DESC' },
      take: 10,
    });

    return engineers.map((e: any, idx: number) => ({
      rank: idx + 1,
      id: e.id,
      name: e.name,
      monthlyOrders: e.monthlyOrders,
      monthlyRevenue: e.monthlyRevenue,
      rating: e.rating,
    }));
  }

  @Get('stats/complaint-rate')
  async getComplaintRate() {
    const totalOrders = await this.workOrderRepo.count();
    const totalComplaints = await this.complaintRepo.count();
    const pendingComplaints = await this.complaintRepo.count({ where: { status: 'PENDING' as any } });

    return {
      totalComplaints,
      pendingComplaints,
      complaintRate: totalOrders > 0 ? Math.round(totalComplaints / totalOrders * 100) : 0,
    };
  }

  // ==================== 投诉管理 ====================
  @Get('complaints')
  async getComplaints(@Query('status') status?: string) {
    const where: any = {};
    if (status && status !== '全部') where.status = status;
    return this.complaintRepo.find({
      where,
      relations: { customer: true, engineer: true } as any,
      order: { createdAt: 'DESC' },
    });
  }

  @Get('complaints/:id')
  async getComplaintDetail(@Param('id') id: string) {
    return this.complaintRepo.findOne({
      where: { id },
      relations: { customer: true, engineer: true, workOrder: true } as any,
    });
  }

  @Put('complaints/:id/handle')
  async handleComplaint(
    @Param('id') id: string,
    @Body() body: { status: string; handleResult: string; refundAmount?: number },
  ) {
    const complaint = await this.complaintRepo.findOne({ where: { id } });
    if (!complaint) throw new Error('投诉不存在');

    complaint.status = body.status as ComplaintStatus;
    complaint.handleResult = body.handleResult;
    if (body.refundAmount !== undefined) {
      complaint.refundAmount = body.refundAmount;
    }
    complaint.handleTime = new Date();

    return this.complaintRepo.save(complaint);
  }
}
