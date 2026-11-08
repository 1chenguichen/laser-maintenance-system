import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Warehouse } from '../database/entities/warehouse.entity.js';
import { PartsInventory } from '../database/entities/parts-inventory.entity.js';
import { Part } from '../database/entities/part.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { Customer } from '../database/entities/customer.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { WorkOrder } from '../database/entities/work-order.entity.js';
import { MaterialRequest, StockMovement, ServiceContract, FinanceRecord } from '../database/entities/operations.entity.js';
import { MaterialRequestDto, ConsumeMaterialDto, ContractDto, ReceiptDto, InvoiceRequestDto, InvoiceIssueDto } from './operations.dto.js';

type User = { sub: string; role: string };
type Bill = { id: string; sourceType: string; number: string; title: string; customer: any; total: number; paid: number; due: number; materialCost: number; status: string };
const number = (prefix: string) => prefix + new Date().toISOString().slice(0, 10).replaceAll('-', '') + randomUUID().slice(0, 8).toUpperCase();
const money = (n: number) => Math.round(n * 100) / 100;
@Injectable()
export class OperationsService {
  constructor(@InjectRepository(Warehouse) private warehouses: Repository<Warehouse>) {}
  private get manager() { return this.warehouses.manager; }
  private async lockStock(m: EntityManager, partId: string, warehouses: string[]) {
    for (const id of [...new Set(warehouses)].sort()) await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [partId + ':' + id]);
  }
  async mobile(engineerId: string): Promise<Warehouse> {
    return this.manager.transaction(async m => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['mobile:' + engineerId]);
      const engineer = await m.findOneBy(Engineer, { id: engineerId });
      if (!engineer) throw new NotFoundException('工程师不存在');
      let warehouse = await m.findOneBy(Warehouse, { ownerEngineerId: engineerId });
      if (!warehouse) warehouse = await m.save(Warehouse, m.create(Warehouse, { name: engineer.name + ' · 移动仓', location: '工程师随身仓', kind: 'MOBILE', ownerEngineerId: engineerId }));
      return warehouse;
    });
  }
  async warehouseList(user: User) {
    const all = await this.warehouses.find({ order: { kind: 'ASC', name: 'ASC' } });
    return user.role === 'cs_operator' ? all : all.filter(w => w.kind === 'CENTRAL' || w.ownerEngineerId === user.sub);
  }
  async mobileOverview(user: User) {
    const warehouse = await this.mobile(user.sub);
    const inventory = await this.manager.find(PartsInventory, { where: { warehouseId: warehouse.id }, relations: { part: true, warehouse: true }, order: { updatedAt: 'DESC' } });
    const requests = await this.requestList(user);
    const consumed = await this.manager.find(StockMovement, { where: { engineerId: user.sub, action: 'CONSUME' }, relations: { part: true }, order: { createdAt: 'DESC' }, take: 100 });
    return { warehouse, inventory, requests, consumed };
  }
  async requestList(user: User) {
    return this.manager.find(MaterialRequest, { where: user.role === 'engineer' ? { engineerId: user.sub } : {}, relations: { part: true, engineer: true, sourceWarehouse: true, targetWarehouse: true }, order: { createdAt: 'DESC' }, take: 300 });
  }
  async createRequest(user: User, dto: MaterialRequestDto) {
    const mobile = await this.mobile(user.sub);
    const central = await this.warehouses.findOneBy({ id: dto.warehouseId, kind: 'CENTRAL', isActive: true });
    if (!central) throw new BadRequestException('请选择有效的公司仓库');
    if (!await this.manager.findOneBy(Part, { id: dto.partId, isActive: true })) throw new BadRequestException('配件不存在');
    return this.manager.save(MaterialRequest, this.manager.create(MaterialRequest, {
      number: number(dto.kind === 'ISSUE' ? 'LL' : 'TL'), kind: dto.kind, engineerId: user.sub, partId: dto.partId,
      sourceWarehouseId: dto.kind === 'ISSUE' ? central.id : mobile.id,
      targetWarehouseId: dto.kind === 'ISSUE' ? mobile.id : central.id,
      quantity: dto.quantity, note: dto.note || '', status: 'PENDING',
    }));
  }
  async requestAction(user: User, id: string, action: string, reviewNote = '') {
    return this.manager.transaction(async m => {
      const request = await m.findOne(MaterialRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request) throw new NotFoundException('单据不存在');
      if (user.role === 'engineer' && request.engineerId !== user.sub) throw new ForbiddenException('无权操作其他工程师的单据');
      const engineerAction = (action === 'ship' && request.kind === 'RETURN') || (action === 'receive' && request.kind === 'ISSUE');
      if ((engineerAction && user.role !== 'engineer') || (!engineerAction && user.role !== 'cs_operator')) throw new ForbiddenException('当前角色不能执行此操作');
      await this.lockStock(m, request.partId, [request.sourceWarehouseId, request.targetWarehouseId]);
      const repo = m.getRepository(PartsInventory);
      const source = await repo.findOneBy({ partId: request.partId, warehouseId: request.sourceWarehouseId });
      if (action === 'approve') {
        if (request.status !== 'PENDING') throw new BadRequestException('仅待审批单据可审批');
        if (!source || source.quantity - source.reservedQuantity < request.quantity) throw new BadRequestException('源仓可用库存不足，请先补货');
        source.reservedQuantity += request.quantity;
        await repo.save(source); request.status = 'APPROVED';
      } else if (action === 'reject') {
        if (!['PENDING', 'APPROVED'].includes(request.status)) throw new BadRequestException('已发货的单据不能驳回');
        if (!reviewNote.trim()) throw new BadRequestException('请填写驳回原因');
        if (request.status === 'APPROVED' && source) { source.reservedQuantity -= request.quantity; await repo.save(source); }
        request.status = 'REJECTED';
      } else if (action === 'ship') {
        if (request.status !== 'APPROVED' || !source || source.quantity < request.quantity || source.reservedQuantity < request.quantity) throw new BadRequestException('单据尚未批准或库存已变更');
        source.quantity -= request.quantity; source.reservedQuantity -= request.quantity;
        await repo.save(source); request.status = 'SHIPPED';
        await this.movement(m, user, request.sourceWarehouseId, request.partId, -request.quantity, 'SHIP', request.engineerId, request.id);
      } else if (action === 'receive') {
        if (request.status !== 'SHIPPED') throw new BadRequestException('仅已发货单据可确认收货，请勿重复操作');
        let target = await repo.findOneBy({ partId: request.partId, warehouseId: request.targetWarehouseId });
        if (!target) target = repo.create({ partId: request.partId, warehouseId: request.targetWarehouseId, quantity: 0, reservedQuantity: 0 });
        target.quantity += request.quantity; await repo.save(target); request.status = 'RECEIVED';
        await this.movement(m, user, request.targetWarehouseId, request.partId, request.quantity, 'RECEIVE', request.engineerId, request.id);
      } else throw new BadRequestException('未知操作');
      request.reviewNote = reviewNote || request.reviewNote;
      return m.save(request);
    });
  }
  private async movement(m: EntityManager, user: User, warehouseId: string, partId: string, quantity: number, action: string, engineerId: string, requestId?: string, workOrderId?: string, note = '') {
    const part = await m.findOneByOrFail(Part, { id: partId });
    return m.save(StockMovement, m.create(StockMovement, { warehouseId, partId, quantity, action, engineerId, requestId, workOrderId, unitCost: Number(part.costPrice || 0), actorId: user.sub, note }));
  }
  async consume(user: User, dto: ConsumeMaterialDto) {
    const warehouse = await this.mobile(user.sub);
    return this.manager.transaction(async m => {
      const order = await m.findOne(WorkOrder, { where: { id: dto.workOrderId, engineerId: user.sub }, lock: { mode: 'pessimistic_write' } });
      if (!order || order.status !== 'REPAIRING') throw new BadRequestException('只能为本人维修中的工单登记用料');
      await this.lockStock(m, dto.partId, [warehouse.id]);
      const inventory = await m.findOneBy(PartsInventory, { partId: dto.partId, warehouseId: warehouse.id });
      if (!inventory || inventory.quantity - inventory.reservedQuantity < dto.quantity) throw new BadRequestException('移动仓可用库存不足');
      inventory.quantity -= dto.quantity; await m.save(inventory);
      return this.movement(m, user, warehouse.id, dto.partId, -dto.quantity, 'CONSUME', user.sub, undefined, order.id, dto.note);
    });
  }
  async journal(user: User) {
    return this.manager.find(StockMovement, { where: user.role === 'engineer' ? { engineerId: user.sub } : {}, relations: { part: true, warehouse: true }, order: { createdAt: 'DESC' }, take: 300 });
  }
  async contractList(user: User) {
    return this.manager.find(ServiceContract, { where: user.role === 'customer' ? { customerId: user.sub } : {}, relations: { customer: true }, order: { createdAt: 'DESC' } });
  }
  async createContract(dto: ContractDto) {
    if (dto.startDate.slice(0, 10) > dto.endDate.slice(0, 10)) throw new BadRequestException('合同结束日期不能早于开始日期');
    if (!await this.manager.findOneBy(Customer, { id: dto.customerId })) throw new BadRequestException('客户不存在');
    for (const id of dto.deviceIds) if (!await this.manager.findOneBy(Device, { id, customerId: dto.customerId })) throw new BadRequestException('合同设备必须属于该客户');
    return this.manager.save(ServiceContract, this.manager.create(ServiceContract, { ...dto, startDate: dto.startDate.slice(0, 10), endDate: dto.endDate.slice(0, 10), number: number('HT'), status: 'DRAFT' }));
  }
  async contractStatus(id: string, status: string) {
    return this.manager.transaction(async m => {
      const contract = await m.findOne(ServiceContract, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contract) throw new NotFoundException('合同不存在');
      if (!((contract.status === 'DRAFT' && status === 'ACTIVE') || (contract.status === 'ACTIVE' && status === 'TERMINATED'))) throw new BadRequestException('合同状态不允许此操作');
      contract.status = status; return m.save(contract);
    });
  }
  async receipt(user: User, dto: ReceiptDto) {
    return this.manager.transaction(async m => {
      const contract = await m.findOne(ServiceContract, { where: { id: dto.contractId }, lock: { mode: 'pessimistic_write' } });
      if (!contract || contract.status !== 'ACTIVE') throw new BadRequestException('仅生效合同可登记收款');
      const previous = await m.find(FinanceRecord, { where: { sourceId: contract.id, kind: 'RECEIPT' } });
      const paid = previous.reduce((sum, r) => sum + Number(r.amount), 0);
      if (money(paid + dto.amount) > Number(contract.amount)) throw new BadRequestException('收款合计不能超过合同金额');
      return m.save(FinanceRecord, m.create(FinanceRecord, { number: number('SK'), kind: 'RECEIPT', sourceType: 'CONTRACT', sourceId: contract.id, customerId: contract.customerId, amount: dto.amount, status: 'CONFIRMED', title: contract.title, actorId: user.sub, note: dto.note || '' }));
    });
  }
  async finance(user: User) {
    const records = await this.manager.find(FinanceRecord, { where: user.role === 'customer' ? { customerId: user.sub } : {}, relations: { customer: true }, order: { createdAt: 'DESC' } });
    const orders = await this.manager.find(WorkOrder, { where: user.role === 'customer' ? { customerId: user.sub } : {}, relations: { customer: true }, order: { createdAt: 'DESC' } });
    const contracts = await this.contractList(user);
    const costs = user.role === 'cs_operator' ? await this.manager.find(StockMovement, { where: { action: 'CONSUME' } }) : [];
    const bills: Bill[] = orders.filter(o => !['PENDING','CANCELLED','REFUSED'].includes(o.status)).map(o => {
      const total = Number(o.finalAmount) || Number(o.partsFee || 0) + Number(o.laborFee || 0);
      const paid = ['REPAIRING', 'PENDING_FINAL_PAYMENT', 'COMPLETED'].includes(o.status) ? Number(o.prepayAmount || 0) + Number(o.finalPaymentAmount || 0) : 0;
      const materialCost = costs.filter(c => c.workOrderId === o.id).reduce((sum, c) => sum + Math.abs(c.quantity) * Number(c.unitCost), 0);
      return { id: o.id, sourceType: 'WORK_ORDER', number: o.orderNo, title: o.faultType, customer: o.customer, total: money(total), paid: money(paid), due: money(total - paid), materialCost: money(materialCost), status: o.status };
    });
    for (const c of contracts.filter(c => c.status !== 'DRAFT')) {
      const paid = records.filter(r => r.kind === 'RECEIPT' && r.sourceId === c.id).reduce((sum, r) => sum + Number(r.amount), 0);
      bills.push({ id: c.id, sourceType: 'CONTRACT', number: c.number, title: c.title, customer: c.customer, total: Number(c.amount), paid: money(paid), due: money(Number(c.amount) - paid), materialCost: 0, status: c.status });
    }
    return { records, bills, summary: { receivable: money(bills.reduce((n,b)=>n+b.total,0)), received: money(bills.reduce((n,b)=>n+b.paid,0)), due: money(bills.reduce((n,b)=>n+b.due,0)), materialCost: money(costs.reduce((n,c)=>n+Math.abs(c.quantity)*Number(c.unitCost),0)), pendingInvoices: records.filter(r=>r.kind==='INVOICE'&&r.status==='REQUESTED').length } };
  }
  async requestInvoice(user: User, dto: InvoiceRequestDto) {
    return this.manager.transaction(async m => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['invoice:' + dto.sourceType + ':' + dto.sourceId]);
      const data = await this.finance(user);
      const bill = data.bills.find(b => b.id === dto.sourceId && b.sourceType === dto.sourceType);
      if (!bill || bill.paid <= 0) throw new BadRequestException('该单据没有可开票的已收款金额');
      const invoices = await m.find(FinanceRecord, { where: { kind: 'INVOICE', sourceType: dto.sourceType, sourceId: bill.id } });
      const available = money(bill.paid - invoices.filter(i => ['REQUESTED','ISSUED'].includes(i.status)).reduce((n,i)=>n+Number(i.amount),0));
      if (available <= 0) throw new BadRequestException('已付款金额已申请开票，请查看发票记录');
      return m.save(FinanceRecord, m.create(FinanceRecord, { number: number('FP'), kind: 'INVOICE', sourceType: dto.sourceType, sourceId: bill.id, customerId: user.sub, amount: available, status: 'REQUESTED', title: dto.title, taxNumber: dto.taxNumber || '', actorId: user.sub }));
    });
  }
  async issueInvoice(user: User, id: string, dto: InvoiceIssueDto) {
    return this.manager.transaction(async m => {
      const invoice = await m.findOne(FinanceRecord, { where: { id, kind: 'INVOICE' }, lock: { mode: 'pessimistic_write' } });
      if (!invoice || invoice.status !== 'REQUESTED') throw new BadRequestException('仅待开票记录可登记发票');
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['invoice-number:' + dto.invoiceNumber]);
      if (await m.findOneBy(FinanceRecord, { kind: 'INVOICE', invoiceNumber: dto.invoiceNumber, status: 'ISSUED' })) throw new BadRequestException('该发票号码已登记');
      invoice.invoiceNumber = dto.invoiceNumber; invoice.note = dto.note || ''; invoice.status = 'ISSUED'; invoice.actorId = user.sub;
      return m.save(invoice);
    });
  }
}
