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

    const part = this.partRepo.create({ ...dto, isActive: true });
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

  async stockIn(dto: StockInDto): Promise<PartsInventory> {
    // 查找或创建库存记录
    let inventory = await this.inventoryRepo.findOne({
      where: { partId: dto.partId, warehouseId: dto.warehouseId },
    });

    if (inventory) {
      inventory.quantity += dto.quantity;
      if (dto.restockDate) {
        inventory.restockDate = new Date(dto.restockDate);
      }
    } else {
      inventory = this.inventoryRepo.create({
        partId: dto.partId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        reservedQuantity: 0,
        restockDate: dto.restockDate ? new Date(dto.restockDate) : null,
      });
    }

    return this.inventoryRepo.save(inventory);
  }

  async stockOut(dto: StockOutDto): Promise<PartsInventory> {
    const inventory = await this.inventoryRepo.findOne({
      where: { partId: dto.partId, warehouseId: dto.warehouseId },
    });

    if (!inventory) throw new NotFoundException('库存记录不存在');
    if (inventory.quantity < dto.quantity) {
      throw new BadRequestException(`库存不足，当前库存: ${inventory.quantity}`);
    }

    inventory.quantity -= dto.quantity;
    return this.inventoryRepo.save(inventory);
  }

  async transfer(dto: TransferDto): Promise<{ from: PartsInventory; to: PartsInventory }> {
    // 源仓库出库
    const fromInventory = await this.inventoryRepo.findOne({
      where: { partId: dto.partId, warehouseId: dto.fromWarehouseId },
    });
    if (!fromInventory) throw new NotFoundException('源仓库库存不存在');
    if (fromInventory.quantity < dto.quantity) {
      throw new BadRequestException('源仓库库存不足');
    }

    fromInventory.quantity -= dto.quantity;
    await this.inventoryRepo.save(fromInventory);

    // 目标仓库入库
    let toInventory = await this.inventoryRepo.findOne({
      where: { partId: dto.partId, warehouseId: dto.toWarehouseId },
    });

    if (toInventory) {
      toInventory.quantity += dto.quantity;
    } else {
      toInventory = this.inventoryRepo.create({
        partId: dto.partId,
        warehouseId: dto.toWarehouseId,
        quantity: dto.quantity,
        reservedQuantity: 0,
      });
    }

    await this.inventoryRepo.save(toInventory);

    return { from: fromInventory, to: toInventory };
  }

  async reserveStock(partId: string, warehouseId: string, quantity: number): Promise<PartsInventory> {
    const inventory = await this.inventoryRepo.findOne({
      where: { partId, warehouseId },
    });

    if (!inventory) throw new NotFoundException('库存不存在');
    if (inventory.quantity - inventory.reservedQuantity < quantity) {
      throw new BadRequestException('可用库存不足');
    }

    inventory.reservedQuantity += quantity;
    return this.inventoryRepo.save(inventory);
  }

  async releaseStock(partId: string, warehouseId: string, quantity: number): Promise<PartsInventory> {
    const inventory = await this.inventoryRepo.findOne({
      where: { partId, warehouseId },
    });

    if (!inventory) throw new NotFoundException('库存不存在');
    inventory.reservedQuantity = Math.max(0, inventory.reservedQuantity - quantity);
    return this.inventoryRepo.save(inventory);
  }
}
