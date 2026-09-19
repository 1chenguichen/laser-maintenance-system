import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({ description: '省份' })
  @IsString()
  province: string;

  @ApiProperty({ description: '城市' })
  @IsString()
  city: string;

  @ApiProperty({ description: '区县' })
  @IsString()
  district: string;

  @ApiProperty({ description: '详细地址' })
  @IsString()
  detail: string;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: '是否默认' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: '地址标签，如"公司"、"仓库"' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateAddressDto extends CreateAddressDto {}

export class CreateDeviceDto {
  @ApiProperty({ description: '设备序列号' })
  @IsString()
  serialNumber: string;

  @ApiProperty({ description: '设备型号' })
  @IsString()
  model: string;

  @ApiProperty({ description: '设备类型' })
  @IsString()
  deviceType: string;

  @ApiPropertyOptional({ description: '购买日期' })
  @IsOptional()
  @IsString()
  purchaseDate?: string;

  @ApiPropertyOptional({ description: '保修到期日' })
  @IsOptional()
  @IsString()
  warrantyExpire?: string;
}

export class CreateWorkOrderDto {
  @ApiProperty({ description: '设备ID' })
  @IsString()
  deviceId: string;

  @ApiProperty({ description: '地址ID' })
  @IsString()
  addressId: string;

  @ApiProperty({ description: '故障类型' })
  @IsString()
  faultType: string;

  @ApiPropertyOptional({ description: '故障描述' })
  @IsOptional()
  @IsString()
  faultDescription?: string;

  @ApiPropertyOptional({ description: '故障照片URLs' })
  @IsOptional()
  @IsArray()
  faultPhotos?: string[];

  @ApiPropertyOptional({ description: '紧急程度 0-普通 1-紧急', default: 0 })
  @IsOptional()
  @IsNumber()
  emergencyLevel?: number;

  @ApiPropertyOptional({ description: '是否有指定工程师', default: false })
  @IsOptional()
  @IsBoolean()
  hasPreferredEngineer?: boolean;

  @ApiPropertyOptional({ description: '指定工程师ID' })
  @IsOptional()
  @IsString()
  preferredEngineerId?: string;
}

export class CreateReviewDto {
  @ApiProperty({ description: '工单ID' })
  @IsString()
  workOrderId: string;

  @ApiProperty({ description: '评分 1-5' })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: '评价内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '评价标签' })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ description: '是否匿名', default: false })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}

export class CreateComplaintDto {
  @ApiPropertyOptional({ description: '工单ID' })
  @IsOptional()
  @IsString()
  workOrderId?: string;

  @ApiProperty({ description: '投诉类型' })
  @IsString()
  complaintType: string;

  @ApiPropertyOptional({ description: '投诉等级 1-5' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  level?: number;

  @ApiPropertyOptional({ description: '退款金额' })
  @IsOptional()
  @IsNumber()
  refundAmount?: number;

  @ApiProperty({ description: '投诉内容' })
  @IsString()
  content: string;
}
