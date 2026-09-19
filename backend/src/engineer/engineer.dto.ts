import { IsString, IsOptional, IsNumber, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EngineerStatus } from '../database/entities/enums.js';

export class UpdateStatusDto {
  @ApiProperty({ description: '工程师状态', enum: EngineerStatus })
  @IsEnum(EngineerStatus)
  status: EngineerStatus;
}

export class UpdateLocationDto {
  @ApiProperty({ description: '经度' })
  @IsNumber()
  longitude: number;

  @ApiProperty({ description: '纬度' })
  @IsNumber()
  latitude: number;

  @ApiPropertyOptional({ description: '地址描述' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class GrabOrderDto {
  @ApiProperty({ description: '工单ID' })
  @IsString()
  workOrderId: string;
}

export class AcceptDesignatedOrderDto {
  @ApiProperty({ description: '工单ID' })
  @IsString()
  workOrderId: string;
}

export class CompleteOrderDto {
  @ApiProperty({ description: '配件费' })
  @IsNumber()
  partsFee: number;

  @ApiProperty({ description: '人工费' })
  @IsNumber()
  laborFee: number;

  @ApiPropertyOptional({ description: '配件明细' })
  @IsOptional()
  @IsArray()
  partsDetail?: { partId: string; name: string; quantity: number; price: number }[];

  @ApiPropertyOptional({ description: '现场照片' })
  @IsOptional()
  @IsArray()
  onSitePhotos?: string[];

  @ApiPropertyOptional({ description: '客户签名URL' })
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @ApiPropertyOptional({ description: '维修报告' })
  @IsOptional()
  @IsString()
  repairReport?: string;
}

export class UploadPhotoDto {
  @ApiProperty({ description: '照片URL' })
  @IsString()
  photoUrl: string;

  @ApiProperty({ description: '照片类型: check_in | on_site | signature' })
  @IsString()
  type: 'check_in' | 'on_site' | 'signature';
}

export class QuoteOrderDto {
  @ApiProperty({ description: '配件费用' })
  @IsNumber()
  partsFee: number;

  @ApiProperty({ description: '人工费用' })
  @IsNumber()
  laborFee: number;
}
