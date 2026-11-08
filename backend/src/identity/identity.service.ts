import {Injectable,UnauthorizedException,BadRequestException,ForbiddenException,HttpException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Redis} from 'ioredis';
import {registry,validateIdentity} from '../tenancy/registry.js';
import {randomUUID} from 'node:crypto';
import {checkPassword,hashPassword} from '../platform/security.js';
import {person,personLinks,validatePerson,resource} from './store.js';
@Injectable()
export class IdentityService {
  private redis=new Redis({host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD||undefined,keyPrefix:'identity-auth:'});
  private dummyHash=hashPassword(randomUUID());
  constructor(private jwt:JwtService){}
  async onModuleDestroy(){await this.redis.quit();}
  private async limit(key:string){const n=await this.redis.incr(key);if(n===1)await this.redis.expire(key,60);if(n>20)throw new HttpException('操作频繁，请稍后再试',429);}
  async sendCode(phone:string){
    if(process.env.IDENTITY_DEMO_AUTH!=='true')throw new HttpException('统一短信认证尚未接入',503);
    await this.limit('sms:'+phone);const code=String(Math.floor(100000+Math.random()*900000));await this.redis.set('otp:'+phone,code,'EX',300);console.log('[Mock identity SMS]',phone,code);return {message:'演示验证码已生成，可使用000000'};
  }
  async login(phone:string,code:string,role?:string,name?:string){
    if(process.env.IDENTITY_DEMO_AUTH!=='true')throw new HttpException('统一短信认证尚未接入',503);
    await this.limit('login:'+phone);
    if(code!=='000000' && await this.redis.getdel('otp:'+phone)!==code)throw new BadRequestException('验证码已过期或无效');
    return this.issue(phone,role,name);
  }
  private async issue(phone:string,role?:string,name?:string){
    const user=await person(phone,name||'新用户');if(!user.enabled)throw new UnauthorizedException('该账号已停用');
    const roles=(await registry.query(`SELECT DISTINCT l.role FROM identity.links l JOIN platform.memberships m ON m.tenant_id=l.tenant_id AND m.role=l.role AND m.subject_id=l.local_id::text AND m.enabled JOIN platform.tenants t ON t.id=l.tenant_id AND t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) WHERE l.person_id=$1`,[user.id])).rows.map(r=>r.role);
    const business=(await registry.query(`SELECT a.username,m.id AS membership_id,m.subject_id,m.name AS account_name,m.version,t.* FROM identity.business_accounts a JOIN platform.memberships m ON m.id=a.membership_id AND m.enabled JOIN platform.tenants t ON t.id=a.tenant_id AND t.enabled AND t.demo_auth AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) WHERE a.enabled AND m.phone=$1`,[phone])).rows;
    const platformEngineer=(await registry.query("SELECT 1 FROM market.engineers WHERE person_id=$1 AND state='APPROVED'",[user.id])).rows.length>0;
    if(platformEngineer&&!roles.includes('engineer'))roles.push('engineer');
    const activeRole=role|| (business.length===1?'cs_operator':roles.includes('engineer')?'engineer':'customer');
    if(activeRole==='cs_operator'){
      if(business.length!==1)throw new ForbiddenException('请使用平台发放的企业管理账号和密码登录');
      const b=business[0],payload={sub:b.subject_id,role:'cs_operator',phone,purpose:'access',tenantId:b.id,membershipId:b.membership_id,version:b.version};
      return {accessToken:this.jwt.sign(payload),identityToken:this.jwt.sign({sub:user.id,role:'customer',purpose:'unified_access',version:user.version,amr:'demo'}),user:{id:b.subject_id,personId:user.id,name:b.account_name,phone,role:'cs_operator',tenantId:b.id,tenantName:b.name,account:b.username,features:b.features,availableRoles:['customer','cs_operator',...roles]}};
    }
    if(!['customer','engineer'].includes(activeRole))throw new BadRequestException('身份类型无效');
    const payload={sub:user.id,role:activeRole,purpose:'unified_access',version:user.version,amr:'demo'};
    const links=await personLinks({...payload,exp:Date.now()/1000+3600});
    if(activeRole==='engineer'&&!links.length&&!platformEngineer)throw new ForbiddenException('该手机号尚未开通可用的工程师账号，请联系企业管理员');
    return {accessToken:this.jwt.sign(payload),user:{id:user.id,name:user.name,phone:user.phone,role:activeRole,availableRoles:[...new Set(['customer',...roles,...(business.length===1?['cs_operator']:[])])],unified:true}};
  }
  async upgrade(payload:any,resume:any={}){
    const tenant=await validateIdentity(payload);
    if(!['customer','engineer'].includes(payload.role)||!tenant.demo_auth||process.env.IDENTITY_DEMO_AUTH!=='true')throw new ForbiddenException('请使用个人账号重新登录');
    const member=(await registry.query('SELECT phone,name FROM platform.memberships WHERE id=$1',[payload.membershipId])).rows[0];
    const result=await this.issue(member.phone,payload.role,member.name);
    const search=new URLSearchParams(typeof resume.search==='string'?resume.search:'');
    for(const key of ['deviceId','workOrderId','orderId']){const value=search.get(key);if(value&&/^[a-f0-9-]{36}$/i.test(value))search.set(key,await resource(tenant.id,key==='deviceId'?'device':'order',value));}
    let hash=typeof resume.hash==='string'?resume.hash:'';if(/^#[a-f0-9-]{36}$/i.test(hash))hash='#'+await resource(tenant.id,'order',hash.slice(1));
    return {...result,resume:{search:search.toString()?'?'+search.toString():'',hash}};
  }
  async switchRole(payload:any,role:string){if(!['customer','engineer','cs_operator'].includes(role))throw new BadRequestException('工作身份无效');const user=await validatePerson(payload);return this.issue(user.phone,role,user.name);}
  localToken(link:any,role:string,phone:string){return this.jwt.sign({sub:link.local_id,role,phone,purpose:'access',tenantId:link.id,membershipId:link.membership_id,version:link.membership_version},{expiresIn:'5m'});}
  async businessLogin(username:string,password:string){
    await this.limit('business:'+username);
    const account=(await registry.query(`SELECT a.*,m.subject_id,m.phone,m.name,m.version FROM identity.business_accounts a JOIN platform.memberships m ON m.id=a.membership_id AND m.enabled WHERE a.username=$1 AND a.enabled`,[username])).rows[0];
    const correct=await checkPassword(password,account?.password_hash||await this.dummyHash);
    if(!account||!correct)throw new UnauthorizedException('企业管理账号或密码不正确');
    const payload={sub:account.subject_id,role:'cs_operator',phone:account.phone,purpose:'access',tenantId:account.tenant_id,membershipId:account.membership_id,version:account.version};
    const tenant=await validateIdentity({...payload,exp:Date.now()/1000+3600});
    return {accessToken:this.jwt.sign(payload),user:{id:account.subject_id,name:account.name,phone:account.phone,role:'cs_operator',tenantId:tenant.id,tenantName:tenant.name,features:tenant.features,account:account.username}};
  }
  async profile(payload:any){const user=await validatePerson(payload);const links=await personLinks(payload);return {id:user.id,name:user.name,phone:user.phone,role:payload.role,unified:true,serviceCount:links.length};}
}
