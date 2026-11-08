import { IsString, IsUUID, IsInt, Min, Max, IsIn, IsOptional, IsNumber, IsBoolean, IsArray, IsDateString, MaxLength, MinLength } from 'class-validator';
export class MaterialRequestDto {
  @IsIn(['ISSUE', 'RETURN']) kind: string;
  @IsUUID() warehouseId: string;
  @IsUUID() partId: string;
  @IsInt() @Min(1) @Max(100000) quantity: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class ConsumeMaterialDto {
  @IsUUID() workOrderId: string;
  @IsUUID() partId: string;
  @IsInt() @Min(1) @Max(100000) quantity: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class ContractDto {
  @IsUUID() customerId: string;
  @IsString() @MinLength(2) @MaxLength(100) title: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsNumber() @Min(0) amount: number;
  @IsBoolean() laborIncluded: boolean;
  @IsNumber() @Min(0) @Max(100) partsDiscount: number;
  @IsArray() @IsUUID('all', { each: true }) deviceIds: string[];
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;
}
export class ReceiptDto {
  @IsUUID() contractId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class InvoiceRequestDto {
  @IsIn(['CONTRACT', 'WORK_ORDER']) sourceType: string;
  @IsUUID() sourceId: string;
  @IsString() @MinLength(2) @MaxLength(100) title: string;
  @IsOptional() @IsString() @MaxLength(30) taxNumber?: string;
}
export class InvoiceIssueDto {
  @IsString() @MinLength(3) @MaxLength(50) invoiceNumber: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
