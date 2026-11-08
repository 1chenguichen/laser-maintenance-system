import {JwtAuthGuard} from '../auth/jwt-auth.guard.js';
import {Roles} from '../auth/roles.decorator.js';
import {Body,Controller,Post,UseGuards,Request} from '@nestjs/common';
import {IsOptional,IsIn,Matches,IsString,MinLength,MaxLength} from 'class-validator';
import {IdentityService} from './identity.service.js';
class PhoneDto { @Matches(/^1[3-9]\d{9}$/) phone:string; }
class PersonLoginDto extends PhoneDto { @Matches(/^\d{6}$/) code:string; @IsOptional() @IsIn(['customer','engineer','cs_operator']) role?:string; @IsOptional() @IsString() @MaxLength(80) name?:string; }
class BusinessLoginDto { @IsString() @MinLength(3) @MaxLength(64) username:string; @IsString() @MinLength(1) @MaxLength(128) password:string; }
@Controller('identity')
export class IdentityController {
  constructor(private service:IdentityService){}
  @Post('upgrade') @UseGuards(JwtAuthGuard) @Roles('customer','engineer') upgrade(@Request() req:any,@Body() body:any){return this.service.upgrade(req.user,body);}
  @Post('send-code') code(@Body() dto:PhoneDto){return this.service.sendCode(dto.phone);}
  @Post('login') login(@Body() dto:PersonLoginDto){return this.service.login(dto.phone,dto.code,dto.role,dto.name);}
  @Post('business-login') business(@Body() dto:BusinessLoginDto){return this.service.businessLogin(dto.username,dto.password);}
}
