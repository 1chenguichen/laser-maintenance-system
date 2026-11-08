import { Body, Controller, Get, Post, Query, BadRequestException, UnauthorizedException, Injectable, OnModuleDestroy, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEnum, Matches } from 'class-validator';
import { isUUID } from 'class-validator';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import { registry } from '../tenancy/registry.js';
import { AuthRole } from './auth.dto.js';
class IdentifyDto {
  @Matches(/^1[3-9]\d{9}$/) phone:string;
  @Matches(/^\d{6}$/) code:string;
  @IsEnum(AuthRole) role:AuthRole;
}
class DiscoveryCodeDto {
  @Matches(/^1[3-9]\d{9}$/) phone:string;
  @IsEnum(AuthRole) role:AuthRole;
}
@Injectable()
export class OrganizationLoginService implements OnModuleDestroy {
  private redis=new Redis({host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD||undefined,keyPrefix:'organization-login:'});
  private attempts=new Map<string,{count:number;until:number}>();
  constructor(private jwt:JwtService){}
  async onModuleDestroy(){await this.redis.quit();}
  async info(id?:string,legacyCode?:string){
    if((!id&&!legacyCode)||(id&&!isUUID(id))||(legacyCode&&!/^[a-z0-9-]{2,40}$/.test(legacyCode)))throw new BadRequestException('企业入口无效，请使用企业提供的登录链接');
    const t=(await registry.query("SELECT id,name,demo_auth FROM platform.tenants WHERE enabled=true AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now()) AND (($1::uuid IS NOT NULL AND id=$1) OR ($1::uuid IS NULL AND code=$2))",[id||null,legacyCode||null])).rows[0];
    if(!t)throw new UnauthorizedException('该企业暂不可用，请联系企业管理员');
    return {id:t.id,name:t.name,demoAuth:t.demo_auth};
  }
  private limit(key:string){
    for(const [k,v] of this.attempts)if(v.until<Date.now())this.attempts.delete(k);
    const previous=this.attempts.get(key);if(previous&&previous.count>=12)throw new HttpException('操作频繁，请稍后再试',429);
    if(this.attempts.size>5000)this.attempts.delete(this.attempts.keys().next().value!);
    this.attempts.set(key,{count:(previous?.count||0)+1,until:previous?.until||Date.now()+60000});
  }
  async sendCode(dto:DiscoveryCodeDto){
    this.limit('send:'+dto.phone);
    const code=String(Math.floor(100000+Math.random()*900000));
    await this.redis.set('otp:'+dto.role+':'+dto.phone,code,'EX',300);
    console.log('[Mock SMS] Organization login phone:',dto.phone,'Code:',code);
    return {message:'当前为演示环境，可使用演示验证码登录'};
  }
  async identify(dto:IdentifyDto){
    this.limit('identify:'+dto.phone);
    if(dto.code!=='000000'){
      const consumed=await this.redis.getdel('otp:'+dto.role+':'+dto.phone);
      if(consumed!==dto.code)throw new BadRequestException('验证码已过期或无效');
    }
    // Only explicitly enabled demo authentication is supported until a real SMS provider is integrated.
    const candidates=(await registry.query("SELECT * FROM platform.tenants WHERE enabled=true AND provisioning_status='READY' AND demo_auth=true AND (expires_at IS NULL OR expires_at>now()) ORDER BY name LIMIT 100")).rows;
    const choices:any[]=[];
    if(dto.role===AuthRole.CS_OPERATOR){
      const allowed=new Set((await registry.query('SELECT tenant_id FROM platform.memberships WHERE phone=$1 AND role=$2 AND enabled=true',[dto.phone,dto.role])).rows.map(m=>m.tenant_id));
      for(const t of candidates)if(allowed.has(t.id))choices.push({id:t.id,name:t.name});
    }else{
      for(let offset=0;offset<candidates.length;offset+=5){
        const found=await Promise.all(candidates.slice(offset,offset+5).map(async t=>{
          if(!/^laser_[a-z0-9_]+$/.test(t.database_name))return null;
          const client=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:t.database_name,connectionTimeoutMillis:3000,statement_timeout:3000});
          try{
            await client.connect();
            const table=dto.role===AuthRole.CUSTOMER?'customers':'engineers';
            const exists=(await client.query('SELECT id FROM '+table+' WHERE phone=$1',[dto.phone])).rows[0];
            if(!exists)return null;
            const blocked=(await registry.query('SELECT id FROM platform.memberships WHERE tenant_id=$1 AND phone=$2 AND role=$3 AND enabled=false',[t.id,dto.phone,dto.role])).rows.length;
            return blocked?null:{id:t.id,name:t.name};
          }catch{throw new HttpException('企业登录服务暂不可用，请稍后重试或使用企业专属入口',503);}finally{await client.end().catch(()=>{});}
        }));
        choices.push(...found.filter(Boolean));
      }
    }
    return {organizations:choices,selectionToken:choices.length?this.jwt.sign({purpose:'organization_selection',phone:dto.phone,role:dto.role,organizations:choices.map(t=>t.id)},{expiresIn:'5m'}):null};
  }
}
@Controller('auth')
export class OrganizationLoginController {
  constructor(private service:OrganizationLoginService){}
  @Get('organization') info(@Query('organizationId') id?:string,@Query('tenantCode') code?:string){return this.service.info(id,code);}
  @Post('discovery-code') send(@Body() dto:DiscoveryCodeDto){return this.service.sendCode(dto);}
  @Post('identify') identify(@Body() dto:IdentifyDto){return this.service.identify(dto);}
}
