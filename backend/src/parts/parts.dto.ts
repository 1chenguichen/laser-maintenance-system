import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePartDto {
  @ApiProperty({ description: '配件名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '配件编码' })
  @IsString()
  code: string;

  @ApiProperty({ description: '配件分类' })
  @IsString()
  category: string;

  @ApiProperty({ description: '单位' })
  @IsString()
  unit: string;

  @ApiPropertyOptional({ description: '指导价' })
  @IsOptional()
  @IsNumber()
  guidePrice?: number;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateWarehouseDto {
  @ApiProperty({ description: '仓库名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '仓库地址' })
  @IsString()
  location: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  contactPhone?: string;
}

export class StockInDto {
  @ApiProperty({ description: '配件ID' })
  @IsString()
  partId: string;

  @ApiProperty({ description: '仓库ID' })
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: '入库数量' })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ description: '预计下次补货日期' })
  @IsOptional()
  @IsString()
  restockDate?: string;
}

export class StockOutDto {
  @ApiProperty({ description: '配件ID' })
  @IsString()
  partId: string;

  @ApiProperty({ description: '仓库ID' })
  @IsString()
  warehouseId: string;

  @ApiProperty({ description: '出库数量' })
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: '关联工单ID' })
  @IsString()
  workOrderId: string;
}

export class TransferDto {
  @ApiProperty({ description: '配件ID' })
  @IsString()
  partId: string;

  @ApiProperty({ description: '源仓库ID' })
  @IsString()
  fromWarehouseId: string;

  @ApiProperty({ description: '目标仓库ID' })
  @IsString()
  toWarehouseId: string;

  @ApiProperty({ description: '转移数量' })
  @IsNumber()
  quantity: number;
}
