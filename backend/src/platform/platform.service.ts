import { createBusinessAccount,openCredential,sealCredential } from '../identity/store.js';
import { randomBytes } from 'node:crypto';
import { Injectable, BadRequestException, ConflictException, NotFoundException, UnauthorizedException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { registry } from '../tenancy/registry.js';
import { baseSource } from '../tenancy/context.js';
import { attachmentBytes } from '../tenancy/storage.js';
import { checkPassword, hashPassword } from './security.js';
import { CreateTenantDto, SubscriptionDto, TenantStateDto } from './platform.dto.js';

type Actor = {id:string;name:string;username?:string};
function state(t:any) {
  if(t.provisioning_status!=='READY')return t.provisioning_status;
  if(!t.enabled)return 'DISABLED';
  if(t.expires_at && new Date(t.expires_at).getTime()<=Date.now())return 'EXPIRED';
  return 'ACTIVE';
}
export function publicTenant(t:any) {
  return {companyProfile:t.company_profile||{},logoDataUrl:t.company_logo||null,profileVersion:t.company_version,id:t.id,code:t.code,name:t.name,enabled:t.enabled,status:state(t),provisioningStatus:t.provisioning_status,
    planCode:t.plan_code,employeeLimit:t.employee_limit,storageLimitMb:t.storage_limit_mb,features:t.features,
    expiresAt:t.expires_at,contactName:t.contact_name,contactPhone:t.contact_phone,adminPhone:t.admin_phone,
    demoAuth:t.demo_auth,createdAt:t.created_at,updatedAt:t.updated_at,provisioningError:t.provisioning_error,attempt:t.attempt};
}
@Injectable()
export class PlatformService {
  private attempts=new Map<string,{count:number;until:number}>();
  private readonly dummyHash=hashPassword(randomUUID());
  constructor(private jwt:JwtService) {}
  async initialize() {
    const username=process.env.PLATFORM_ADMIN_USERNAME,password=process.env.PLATFORM_ADMIN_PASSWORD;
    if(username && password){
      if(password.length<12)throw Error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters');
      // Initial bootstrap only: restarting never overwrites a password changed in the UI.
      await registry.query('INSERT INTO platform.admins(id,username,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(username) DO NOTHING',[randomUUID(),username,'平台管理员',await hashPassword(password)]);
    }
    // This local preview runs one backend instance. Recover interrupted, persisted provisioning jobs.
    await registry.query("UPDATE platform.tenants SET provisioning_status='FAILED',provisioning_error='上次开通因服务重启中断，请重试',updated_at=now() WHERE provisioning_status='PROVISIONING'");
  }
  async audit(actor:Actor|null,tenantId:string|null,action:string,before:any,after:any,reason='',client:any=registry){
    await client.query('INSERT INTO platform.audit_logs(id,actor_id,actor_name,tenant_id,action,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[randomUUID(),actor?.id||null,actor?.name||'系统',tenantId,action,reason,JSON.stringify(before),JSON.stringify(after)]);
  }
  async login(username:string,password:string,ip:string){
    const key=ip+':'+username.toLowerCase();
    for(const [k,v] of this.attempts)if(v.until<Date.now())this.attempts.delete(k);
    const limit=this.attempts.get(key);
    if(limit && limit.count>=5)throw new HttpException('尝试次数过多，请15分钟后重试',429);
    const user=(await registry.query('SELECT * FROM platform.admins WHERE username=$1 AND enabled=true',[username])).rows[0];
    const correct=await checkPassword(password,user?.password_hash||await this.dummyHash);
    if(!user || !correct){
      if(this.attempts.size>5000)this.attempts.delete(this.attempts.keys().next().value!);
      this.attempts.set(key,{count:(limit?.count||0)+1,until:limit?.until||Date.now()+900000});
      throw new UnauthorizedException('平台账号或密码错误');
    }
    this.attempts.delete(key);
    await this.audit(user,null,'PLATFORM_LOGIN',null,{username:user.username});
    return {accessToken:this.jwt.sign({sub:user.id,role:'platform_admin',purpose:'platform_access',version:user.version},{expiresIn:'8h'}),user:{id:user.id,username:user.username,name:user.name}};
  }
  async changePassword(actor:Actor,current:string,next:string){
    const user=(await registry.query('SELECT * FROM platform.admins WHERE id=$1',[actor.id])).rows[0];
    if(!user || !await checkPassword(current,user.password_hash))throw new BadRequestException('当前密码不正确');
    if(current===next)throw new BadRequestException('新密码需要与当前密码不同');
    const hash=await hashPassword(next),client=await registry.connect();
    try{await client.query('BEGIN');await client.query('UPDATE platform.admins SET password_hash=$1,version=version+1 WHERE id=$2',[hash,actor.id]);await this.audit(actor,null,'PLATFORM_PASSWORD_CHANGED',null,null,'',client);await client.query('COMMIT');}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    return {message:'密码已修改，请重新登录'};
  }
  async overview(){
    const counts=(await registry.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE provisioning_status='READY' AND enabled AND (expires_at IS NULL OR expires_at>now()))::int AS active,
      count(*) FILTER(WHERE provisioning_status='READY' AND NOT enabled)::int AS disabled,
      count(*) FILTER(WHERE provisioning_status='READY' AND enabled AND expires_at<=now())::int AS expired,
      count(*) FILTER(WHERE provisioning_status='PROVISIONING')::int AS provisioning,
      count(*) FILTER(WHERE provisioning_status='FAILED')::int AS failed,
      count(*) FILTER(WHERE provisioning_status='READY' AND enabled AND expires_at>now() AND expires_at<now()+interval '7 days')::int AS expiring
      FROM platform.tenants`)).rows[0];
    return {...counts,uptime:Math.floor(process.uptime()),checkedAt:new Date().toISOString()};
  }
  async plans(){return (await registry.query('SELECT code,name,employee_limit AS "employeeLimit",storage_limit_mb AS "storageLimitMb",features,description FROM platform.plans ORDER BY employee_limit')).rows;}
  private async plan(code:string){const p=(await registry.query('SELECT * FROM platform.plans WHERE code=$1',[code])).rows[0];if(!p)throw new BadRequestException('套餐不存在');return p;}
  private validExpiry(expiry:string,allowPast=false){const value=new Date(expiry);if(!Number.isFinite(value.getTime()) || (!allowPast && value.getTime()<=Date.now()))throw new BadRequestException('有效期须晚于当前时间');return value;}
  async getTenant(id:string){const row=(await registry.query('SELECT * FROM platform.tenants WHERE id=$1',[id])).rows[0];if(!row)throw new NotFoundException('企业不存在');return row;}
  async usage(t:any,controlClient:any=registry){
    if(t.provisioning_status!=='READY')return {available:false};
    if(!/^laser_[a-z0-9_]+$/.test(t.database_name))return {available:false,error:'企业数据库配置异常'};
    const client=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:t.database_name,connectionTimeoutMillis:3000,statement_timeout:5000});
    try{
      await client.connect();
      const [business,staff,bytes]=await Promise.all([
        client.query('SELECT (SELECT count(*)::int FROM customers) AS customers,(SELECT count(*)::int FROM engineers) AS engineers,(SELECT count(*)::int FROM work_orders) AS orders'),
        controlClient.query("SELECT count(*)::int AS count FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator'",[t.id]),
        attachmentBytes(t.id),
      ]);
      const row=business.rows[0];return {available:true,...row,employees:row.engineers+staff.rows[0].count,attachmentBytes:bytes,checkedAt:new Date().toISOString()};
    }catch{return {available:false,error:'暂时无法读取用量，请稍后刷新'};}finally{await client.end().catch(()=>{});}
  }
  async list(search='',status='',page=1){
    const offset=(page-1)*10,term='%'+search+'%';
    const statusSQL=`CASE WHEN provisioning_status<>'READY' THEN provisioning_status WHEN NOT enabled THEN 'DISABLED' WHEN expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END`;
    const where=`WHERE (name ILIKE $1 OR code ILIKE $1 OR contact_phone ILIKE $1) AND ($2='' OR (${statusSQL})=$2)`;
    const [rows,count]=await Promise.all([registry.query(`SELECT * FROM platform.tenants ${where} ORDER BY created_at DESC,id LIMIT 10 OFFSET $3`,[term,status,offset]),registry.query(`SELECT count(*)::int AS total FROM platform.tenants ${where}`,[term,status])]);
    const items=await Promise.all(rows.rows.map(async t=>({...publicTenant(t),usage:await this.usage(t)})));
    return {items,total:count.rows[0].total,page,pageSize:10};
  }
  async detail(id:string){const t=await this.getTenant(id);const account=(await registry.query('SELECT username,initial_password_encrypted,issued_password_encrypted FROM identity.business_accounts WHERE tenant_id=$1',[id])).rows[0];return {...publicTenant(t),adminAccount:account?.username,initialPassword:openCredential(account?.initial_password_encrypted),issuedPassword:openCredential(account?.issued_password_encrypted),usage:await this.usage(t)};}
  async create(dto:CreateTenantDto,actor:Actor){
    const plan=await this.plan(dto.planCode),expiry=this.validExpiry(dto.expiresAt),id=randomUUID(),database='laser_tenant_'+id.replaceAll('-','');
    const client=await registry.connect();let tenant:any,adminCredentials:any;
    try{
      await client.query('BEGIN');
      tenant=(await client.query(`INSERT INTO platform.tenants(id,code,name,database_name,enabled,demo_auth,provisioning_status,plan_code,employee_limit,storage_limit_mb,features,expires_at,contact_name,contact_phone,admin_phone,attempt)
        VALUES($1,$2,$3,$4,false,$5,'PROVISIONING',$6,$7,$8,$9::jsonb,$10,$11,$12,$13,1) RETURNING *`,[id,dto.code || 'org-'+id.replaceAll('-','').slice(0,12),dto.name,database,dto.demoAuth,plan.code,plan.employee_limit,plan.storage_limit_mb,JSON.stringify(plan.features),expiry,dto.contactName,dto.contactPhone||'',dto.adminPhone])).rows[0];
      adminCredentials=await createBusinessAccount(id,null,dto.adminAccount,dto.adminPassword,client);
      await this.audit(actor,id,'TENANT_CREATE',null,publicTenant(tenant),'创建企业并自动开通',client);await client.query('COMMIT');
    }catch(error:any){await client.query('ROLLBACK');if(error.code==='23505')throw new ConflictException('企业或登录账号已存在，请使用其他账号');throw error;}finally{client.release();}
    this.schedule(tenant,actor);return {...publicTenant(tenant),adminCredentials};
  }
  private schedule(tenant:any,actor:Actor){void this.provision(tenant,actor).catch(error=>console.error('[Platform] Provisioning state update failed',tenant.code,error.code||'unknown'));}
  private async provision(t:any,actor:Actor){
    let source:DataSource|undefined;
    try{
      // Database identifiers are generated by the server, never copied from a request.
      if(t.database_name!=='laser_tenant_'+t.id.replaceAll('-',''))throw Error('Invalid provision target');
      const operator=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:'postgres',connectionTimeoutMillis:5000});
      try{await operator.connect();if(!(await operator.query('SELECT 1 FROM pg_database WHERE datname=$1',[t.database_name])).rows.length)await operator.query('CREATE DATABASE "'+t.database_name+'"');}finally{await operator.end();}
      source=new DataSource({...baseSource().options,database:t.database_name,synchronize:true,extra:{max:2}} as any);
      await source.initialize();await source.destroy();source=undefined;
      const client=await registry.connect();
      try{
        await client.query('BEGIN');
        const current=(await client.query("SELECT * FROM platform.tenants WHERE id=$1 AND provisioning_status='PROVISIONING' AND attempt=$2 FOR UPDATE",[t.id,t.attempt])).rows[0];
        if(!current){await client.query('ROLLBACK');return;}
        const member=randomUUID();
        await client.query("INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,'cs_operator',$4,'企业管理员') ON CONFLICT(tenant_id,role,phone) DO NOTHING",[member,t.id,member,t.admin_phone]);
        const actual=(await client.query("SELECT id FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND phone=$2",[t.id,t.admin_phone])).rows[0];
        await createBusinessAccount(t.id,actual.id,undefined,undefined,client);
        await client.query('UPDATE identity.business_accounts SET membership_id=$2 WHERE tenant_id=$1',[t.id,actual.id]);
        const next=(await client.query("UPDATE platform.tenants SET provisioning_status='READY',enabled=true,provisioning_error=NULL,updated_at=now() WHERE id=$1 RETURNING *",[t.id])).rows[0];
        await this.audit(actor,t.id,'TENANT_READY',publicTenant(current),publicTenant(next),'数据库和管理员已就绪',client);await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }catch(error:any){
      if(source?.isInitialized)await source.destroy().catch(()=>{});
      console.error('[Platform] Provision failed',t.code,error.code||'SCHEMA_ERROR');
      const next=(await registry.query("UPDATE platform.tenants SET provisioning_status='FAILED',enabled=false,provisioning_error=$2,updated_at=now() WHERE id=$1 AND provisioning_status='PROVISIONING' AND attempt=$3 RETURNING *",[t.id,'数据库初始化未完成，请重试；反复失败时联系运维检查数据库权限',t.attempt])).rows[0];
      if(next)await this.audit(actor,t.id,'TENANT_FAILED',null,publicTenant(next),'自动开通失败');
    }
  }
  async retry(id:string,actor:Actor,reason:string){
    const next=await this.mutate(id,actor,'TENANT_RETRY',reason,async(t,c)=>{
      if(t.provisioning_status!=='FAILED')throw new BadRequestException('只有开通失败的企业可以重试');
      return (await c.query("UPDATE platform.tenants SET provisioning_status='PROVISIONING',provisioning_error=NULL,attempt=attempt+1,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
    });
    this.schedule(next,actor);return publicTenant(next);
  }
  async setState(id:string,dto:TenantStateDto,actor:Actor){
    const next=await this.mutate(id,actor,dto.enabled?'TENANT_ENABLE':'TENANT_DISABLE',dto.reason,async(t,c)=>{
      if(t.provisioning_status!=='READY')throw new BadRequestException('企业尚未开通完成');
      if(dto.enabled && t.expires_at && new Date(t.expires_at).getTime()<=Date.now())throw new BadRequestException('企业已过期，请先续期');
      if(t.enabled===dto.enabled)throw new ConflictException('企业状态已变化，请刷新');
      return (await c.query('UPDATE platform.tenants SET enabled=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,dto.enabled])).rows[0];
    });return publicTenant(next);
  }
  async subscription(id:string,dto:SubscriptionDto,actor:Actor){
    const plan=await this.plan(dto.planCode),expiry=this.validExpiry(dto.expiresAt);
    const next=await this.mutate(id,actor,'TENANT_SUBSCRIPTION',dto.reason,async(t,c)=>{
      if(t.provisioning_status!=='READY')throw new BadRequestException('企业尚未开通完成');
      const usage=await this.usage(t,c);
      if(!usage.available)throw new BadRequestException('无法核实当前用量，请刷新后重试');
      if((usage as any).employees>dto.employeeLimit || (usage as any).attachmentBytes>dto.storageLimitMb*1048576)throw new BadRequestException('新额度低于当前实际用量，请先清理或提高额度');
      return (await c.query('UPDATE platform.tenants SET plan_code=$2,employee_limit=$3,storage_limit_mb=$4,features=$5::jsonb,expires_at=$6,updated_at=now() WHERE id=$1 RETURNING *',[id,plan.code,dto.employeeLimit,dto.storageLimitMb,JSON.stringify(plan.features),expiry])).rows[0];
    });return publicTenant(next);
  }
  private async mutate(id:string,actor:Actor,action:string,reason:string,change:(t:any,c:any)=>Promise<any>){
    const client=await registry.connect();
    try{await client.query('BEGIN');const t=(await client.query('SELECT * FROM platform.tenants WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!t)throw new NotFoundException('企业不存在');const next=await change(t,client);await this.audit(actor,id,action,publicTenant(t),publicTenant(next),reason,client);await client.query('COMMIT');return next;}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async resetBusinessPassword(id:string,actor:Actor,reason:string){
    const password=randomBytes(12).toString('base64url'),hash=await hashPassword(password),client=await registry.connect();
    try{await client.query('BEGIN');const account=(await client.query('SELECT * FROM identity.business_accounts WHERE tenant_id=$1 FOR UPDATE',[id])).rows[0];if(!account)throw new NotFoundException('企业管理账号尚未开通');await client.query('UPDATE identity.business_accounts SET password_hash=$2,issued_password_encrypted=$3 WHERE id=$1',[account.id,hash,sealCredential(password)]);await client.query('UPDATE platform.memberships SET version=version+1 WHERE id=$1',[account.membership_id]);await this.audit(actor,id,'BUSINESS_PASSWORD_RESET',null,{username:account.username},reason,client);await client.query('COMMIT');return {username:account.username,password};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async logs(page=1,tenantId?:string){
    const [rows,count]=await Promise.all([registry.query('SELECT l.id,l.actor_name AS "actorName",l.action,l.reason,l.before_data AS "before",l.after_data AS "after",l.created_at AS "createdAt",t.code AS "tenantCode",t.name AS "tenantName" FROM platform.audit_logs l LEFT JOIN platform.tenants t ON t.id=l.tenant_id WHERE ($1::uuid IS NULL OR l.tenant_id=$1) ORDER BY l.created_at DESC,l.id LIMIT 20 OFFSET $2',[tenantId||null,(page-1)*20]),registry.query('SELECT count(*)::int AS total FROM platform.audit_logs WHERE ($1::uuid IS NULL OR tenant_id=$1)',[tenantId||null])]);
    return {items:rows.rows,total:count.rows[0].total,page,pageSize:20};
  }
}
