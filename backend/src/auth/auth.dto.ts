import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';

export enum AuthRole {
  CUSTOMER = 'customer',
  ENGINEER = 'engineer',
  CS_OPERATOR = 'cs_operator',
}

export class LoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入正确的手机号' })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码为6位数字' })
  code: string;

  @IsEnum(AuthRole)
  role: AuthRole;
}

export class SendCodeDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入正确的手机号' })
  phone: string;
}

export class RegisterDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入正确的手机号' })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码为6位数字' })
  code: string;

  @IsEnum(AuthRole)
  role: AuthRole;

  @IsOptional()
  @IsString()
  name?: string;
}
