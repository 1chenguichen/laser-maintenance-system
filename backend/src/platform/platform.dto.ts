import { IsString, Matches, MinLength, MaxLength, IsIn, IsOptional, IsInt, Min, Max, IsBoolean, IsDateString } from 'class-validator';
export class PlatformLoginDto {
  @IsString() @MinLength(3) @MaxLength(50) username: string;
  @IsString() @MinLength(1) @MaxLength(128) password: string;
}
export class CreateTenantDto {
  @IsOptional() @Matches(/^[a-zA-Z0-9_.@-]{3,40}$/) adminAccount?:string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) adminPassword?:string;
  @IsOptional() @Matches(/^[a-z][a-z0-9-]{1,39}$/) code?: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @Matches(/^1[3-9]\d{9}$/) adminPhone: string;
  @IsString() @MaxLength(60) contactName: string;
  @IsOptional() @Matches(/^1[3-9]\d{9}$/) contactPhone?: string;
  @IsIn(['basic','professional','enterprise']) planCode: string;
  @IsDateString() expiresAt: string;
  @IsBoolean() demoAuth: boolean;
}
export class SubscriptionDto {
  @IsIn(['basic','professional','enterprise']) planCode: string;
  @IsDateString() expiresAt: string;
  @IsInt() @Min(1) @Max(5000) employeeLimit: number;
  @IsInt() @Min(1) @Max(1048576) storageLimitMb: number;
  @IsString() @MinLength(2) @MaxLength(500) reason: string;
}
export class TenantStateDto {
  @IsBoolean() enabled: boolean;
  @IsString() @MinLength(2) @MaxLength(500) reason: string;
}
export class RetryDto { @IsString() @MinLength(2) @MaxLength(500) reason: string; }
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}
