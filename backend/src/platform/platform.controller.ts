import { isUUID } from 'class-validator';
import { Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards, ParseUUIDPipe, BadRequestException } from '@nestjs/common';
import { PlatformGuard } from './security.js';
import { PlatformService } from './platform.service.js';
import { PlatformLoginDto, CreateTenantDto, SubscriptionDto, TenantStateDto, RetryDto, ChangePasswordDto } from './platform.dto.js';
function pageNumber(value?:string){if(value && !/^[1-9]\d{0,5}$/.test(value))throw new BadRequestException('页码无效');return Number(value||1);}
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private service:PlatformService){}
  @Post('login') login(@Body() dto:PlatformLoginDto,@Request() req:any){return this.service.login(dto.username,dto.password,req.ip);}
  @Get('profile') @UseGuards(PlatformGuard) profile(@Request() req:any){return req.platformAdmin;}
  @Post('password') @UseGuards(PlatformGuard) password(@Body() dto:ChangePasswordDto,@Request() req:any){return this.service.changePassword(req.platformAdmin,dto.currentPassword,dto.newPassword);}
}
@Controller('platform')
@UseGuards(PlatformGuard)
export class PlatformController {
  constructor(private service:PlatformService){}
  @Get('overview') overview(){return this.service.overview();}
  @Get('plans') plans(){return this.service.plans();}
  @Get('tenants') tenants(@Query('search') search='',@Query('status') status='',@Query('page') page?:string){
    if(search.length>100 || !['','ACTIVE','DISABLED','EXPIRED','PROVISIONING','FAILED'].includes(status))throw new BadRequestException('筛选条件无效');
    return this.service.list(search,status,pageNumber(page));
  }
  @Post('tenants') create(@Body() dto:CreateTenantDto,@Request() req:any){return this.service.create(dto,req.platformAdmin);}
  @Get('tenants/:id') detail(@Param('id',ParseUUIDPipe) id:string){return this.service.detail(id);}
  @Put('tenants/:id/state') state(@Param('id',ParseUUIDPipe) id:string,@Body() dto:TenantStateDto,@Request() req:any){return this.service.setState(id,dto,req.platformAdmin);}
  @Put('tenants/:id/subscription') subscription(@Param('id',ParseUUIDPipe) id:string,@Body() dto:SubscriptionDto,@Request() req:any){return this.service.subscription(id,dto,req.platformAdmin);}
  @Post('tenants/:id/admin-password') resetPassword(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RetryDto,@Request() req:any){return this.service.resetBusinessPassword(id,req.platformAdmin,dto.reason);}
  @Post('tenants/:id/retry') retry(@Param('id',ParseUUIDPipe) id:string,@Body() dto:RetryDto,@Request() req:any){return this.service.retry(id,req.platformAdmin,dto.reason);}
  @Get('logs') logs(@Query('page') page?:string,@Query('tenantId') tenantId?:string){if(tenantId && !isUUID(tenantId))throw new BadRequestException('企业编号无效');return this.service.logs(pageNumber(page),tenantId);}
}
