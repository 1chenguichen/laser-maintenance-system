import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PartsService } from './parts.service.js';
import { CreatePartDto, CreateWarehouseDto, StockInDto, StockOutDto, TransferDto } from './parts.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('parts')
@UseGuards(JwtAuthGuard)
export class PartsController {
  constructor(private partsService: PartsService) {}

  // ==================== 配件 ====================
  @Get()
  async getParts(@Query('category') category?: string) {
    return this.partsService.getParts(category);
  }

  @Post()
  async createPart(@Body() dto: CreatePartDto) {
    return this.partsService.createPart(dto);
  }

  @Put(':id')
  async updatePart(@Param('id') id: string, @Body() dto: Partial<CreatePartDto>) {
    return this.partsService.updatePart(id, dto);
  }

  // ==================== 仓库 ====================
  @Get('warehouses')
  async getWarehouses() {
    return this.partsService.getWarehouses();
  }

  @Post('warehouses')
  async createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.partsService.createWarehouse(dto);
  }

  // ==================== 库存 ====================
  @Get('inventory')
  async getInventory(@Query('warehouseId') warehouseId?: string, @Query('partId') partId?: string) {
    return this.partsService.getInventory(warehouseId, partId);
  }

  @Get('inventory/low-stock')
  async getLowStockAlerts() {
    return this.partsService.getLowStockAlerts();
  }

  @Post('stock-in')
  async stockIn(@Body() dto: StockInDto) {
    return this.partsService.stockIn(dto);
  }

  @Post('stock-out')
  async stockOut(@Body() dto: StockOutDto) {
    return this.partsService.stockOut(dto);
  }

  @Post('transfer')
  async transfer(@Body() dto: TransferDto) {
    return this.partsService.transfer(dto);
  }

  @Post('reserve')
  async reserveStock(@Body() body: { partId: string; warehouseId: string; quantity: number }) {
    return this.partsService.reserveStock(body.partId, body.warehouseId, body.quantity);
  }

  @Post('release')
  async releaseStock(@Body() body: { partId: string; warehouseId: string; quantity: number }) {
    return this.partsService.releaseStock(body.partId, body.warehouseId, body.quantity);
  }
}
