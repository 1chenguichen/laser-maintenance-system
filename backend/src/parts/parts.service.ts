import { StockMovement } from '../database/entities/operations.entity.js';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Part } from '../database/entities/part.entity.js';
import { Warehouse } from '../database/entities/warehouse.entity.js';
import { PartsInventory } from '../database/entities/parts-inventory.entity.js';
import { CreatePartDto, CreateWarehouseDto, StockInDto, StockOutDto, TransferDto } from './parts.dto.js';

@Injectable()
export class PartsService {
  constructor(
    @InjectRepository(Part) private partRepo: Repository<Part>,
    @InjectRepository(Warehouse) private warehouseRepo: Repository<Warehouse>,
    @InjectRepository(PartsInventory) private inventoryRepo: Repository<PartsInventory>,
  ) {}

  // ==================== 配件管理 ====================
  async getParts(category?: string): Promise<Part[]> {
    const where = category ? { category, isActive: true } : { isActive: true };
    return this.partRepo.find({ where, order: { name: 'ASC' } });
  }

  async createPart(dto: CreatePartDto): Promise<Part> {
    const exists = await this.partRepo.findOne({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('配件编码已存在');

    const part = this.partRepo.create({ ...dto, guidePrice: dto.guidePrice ?? 0, isActive: true });
    return this.partRepo.save(part);
  }

  async updatePart(id: string, dto: Partial<CreatePartDto>): Promise<Part> {
    const part = await this.partRepo.findOne({ where: { id } });
    if (!part) throw new NotFoundException('配件不存在');

    Object.assign(part, dto);
    return this.partRepo.save(part);
  }

  // ==================== 仓库管理 ====================
  async getWarehouses(): Promise<Warehouse[]> {
    return this.warehouseRepo.find({ order: { name: 'ASC' } });
  }

  async createWarehouse(dto: CreateWarehouseDto): Promise<Warehouse> {
    const warehouse = this.warehouseRepo.create(dto);
    return this.warehouseRepo.save(warehouse);
  }

  // ==================== 库存管理 ====================
  async getInventory(warehouseId?: string, partId?: string): Promise<PartsInventory[]> {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (partId) where.partId = partId;

    return this.inventoryRepo.find({
      where,
      relations: { part: true, warehouse: true } as any,
      order: { quantity: 'ASC' },
    });
  }

  async getLowStockAlerts(): Promise<PartsInventory[]> {
    // 找出库存低于安全库存的记录
    const all = await this.inventoryRepo.find({
      relations: { part: true, warehouse: true } as any,
    });

    return all.filter((inv) => inv.quantity < inv.reservedQuantity);
  }

  // Serialize updates to the same part/warehouse, including creation of a new row.
  private async withInventoryLocks<T>(keys: string[], action: (repo: Repository<PartsInventory>) => Promise<T>): Promise<T> {
    return this.inventoryRepo.manager.transaction(async manager => {
      for (const key of [...new Set(keys)].sort()) await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
      return action(manager.getRepository(PartsInventory));
    });
  }

  private validQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException('数量必须为正整数');
  }

  async stockIn(dto: StockInDto, actorId = 'system'): Promise<PartsInventory> {
    this.validQuantity(dto.quantity);
    if (!await this.partRepo.findOneBy({ id: dto.partId }) || !await this.warehouseRepo.findOneBy({ id: dto.warehouseId })) throw new NotFoundException('配件或仓库不存在');
    return this.withInventoryLocks([dto.partId + ':' + dto.warehouseId], async repo => {
      let item = await repo.findOneBy({ partId: dto.partId, warehouseId: dto.warehouseId });
      if (!item) item = repo.create({ partId: dto.partId, warehouseId: dto.warehouseId, quantity: 0, reservedQuantity: 0 });
      item.quantity += dto.quantity;
      if (dto.restockDate) item.restockDate = new Date(dto.restockDate);
      await repo.save(item);
      const part = await repo.manager.findOneByOrFail(Part, { id: dto.partId });
      await repo.manager.save(StockMovement, repo.manager.create(StockMovement, { warehouseId: dto.warehouseId, partId: dto.partId, quantity: dto.quantity, action: 'STOCK_IN', actorId, unitCost: Number(part.costPrice || 0), note: '配件入库' }));
      return item;
    });
  }

  async stockOut(dto: StockOutDto): Promise<PartsInventory> {
    this.validQuantity(dto.quantity);
    return this.withInventoryLocks([dto.partId + ':' + dto.warehouseId], async repo => {
      const item = await repo.findOneBy({ partId: dto.partId, warehouseId: dto.warehouseId });
      if (!item) throw new NotFoundException('库存记录不存在');
      if (item.quantity - item.reservedQuantity < dto.quantity) throw new BadRequestException('可用库存不足');
      item.quantity -= dto.quantity;
      return repo.save(item);
    });
  }

  async transfer(dto: TransferDto): Promise<{ from: PartsInventory; to: PartsInventory }> {
    this.validQuantity(dto.quantity);
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('源仓库和目标仓库不能相同');
    if (!await this.warehouseRepo.findOneBy({ id: dto.toWarehouseId })) throw new NotFoundException('目标仓库不存在');
    return this.withInventoryLocks([dto.partId + ':' + dto.fromWarehouseId, dto.partId + ':' + dto.toWarehouseId], async repo => {
      const from = await repo.findOneBy({ partId: dto.partId, warehouseId: dto.fromWarehouseId });
      if (!from) throw new NotFoundException('源仓库库存不存在');
      if (from.quantity - from.reservedQuantity < dto.quantity) throw new BadRequestException('源仓库可用库存不足');
      let to = await repo.findOneBy({ partId: dto.partId, warehouseId: dto.toWarehouseId });
      if (!to) to = repo.create({ partId: dto.partId, warehouseId: dto.toWarehouseId, quantity: 0, reservedQuantity: 0 });
      from.quantity -= dto.quantity;
      to.quantity += dto.quantity;
      await repo.save([from, to]);
      return { from, to };
    });
  }

  async reserveStock(partId: string, warehouseId: string, quantity: number): Promise<PartsInventory> {
    this.validQuantity(quantity);
    return this.withInventoryLocks([partId + ':' + warehouseId], async repo => {
      const item = await repo.findOneBy({ partId, warehouseId });
      if (!item) throw new NotFoundException('库存不存在');
      if (item.quantity - item.reservedQuantity < quantity) throw new BadRequestException('可用库存不足');
      item.reservedQuantity += quantity;
      return repo.save(item);
    });
  }

  async releaseStock(partId: string, warehouseId: string, quantity: number): Promise<PartsInventory> {
    this.validQuantity(quantity);
    return this.withInventoryLocks([partId + ':' + warehouseId], async repo => {
      const item = await repo.findOneBy({ partId, warehouseId });
      if (!item) throw new NotFoundException('库存不存在');
      if (item.reservedQuantity < quantity) throw new BadRequestException('释放数量超过已预留数量');
      item.reservedQuantity -= quantity;
      return repo.save(item);
    });
  }
}
