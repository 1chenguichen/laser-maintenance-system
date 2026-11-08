import { indexPerson } from '../identity/store.js';
import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../database/entities/customer.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { LoginDto, RegisterDto, AuthRole } from './auth.dto.js';
import { currentTenant, tenantContext } from '../tenancy/context.js';
import { membership, registry } from '../tenancy/registry.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}
  async sendCode(phone: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redisService.setCode(phone, code);
    if (currentTenant().demo_auth) console.log(`[Mock SMS] Tenant: ${currentTenant().code}, Phone: ${phone}, Code: ${code}`);
    return { message: currentTenant().demo_auth ? '演示验证码已生成' : '当前企业尚未配置短信服务，请联系管理员' };
  }
  private async verifyCode(phone: string, code: string) {
    if (!currentTenant().demo_auth) throw new UnauthorizedException('当前企业尚未配置短信认证服务');
    if (code === '000000') return;
    const stored = await this.redisService.getCode(phone);
    if (!stored || stored !== code) throw new BadRequestException('验证码已过期或无效');
    await this.redisService.delCode(phone);
  }
  async login(dto: LoginDto) {
    if(!tenantContext.getStore()?.loginVerified) await this.verifyCode(dto.phone,dto.code);
    let user: any;
    const tenant = currentTenant();
    if (dto.role === AuthRole.CUSTOMER) {
      user = await this.customerRepo.findOne({where:{phone:dto.phone}});
      if (!user) user = await this.customerRepo.save(this.customerRepo.create({phone:dto.phone,name:'新客户'}));
    } else if (dto.role === AuthRole.ENGINEER) {
      user = await this.engineerRepo.findOne({where:{phone:dto.phone}});
      if (!user) throw new UnauthorizedException('该企业未开通此工程师账号');
    } else if (dto.role === AuthRole.CS_OPERATOR) {
      const { rows } = await registry.query('SELECT subject_id AS id,name,phone FROM platform.memberships WHERE tenant_id=$1 AND phone=$2 AND role=$3 AND enabled=true',[tenant.id,dto.phone,dto.role]);
      user = rows[0];
      if (!user) throw new UnauthorizedException('该企业未开通此管理员账号');
    } else throw new UnauthorizedException('不支持的角色');
    const member = await membership(tenant,dto.role,user);
    if(dto.role==='customer'||dto.role==='engineer')await indexPerson(tenant.id,dto.role,user.id,user.phone,user.name);
    const accessToken = this.jwtService.sign({sub:user.id,role:dto.role,phone:user.phone,purpose:'access',tenantId:tenant.id,membershipId:member.id,version:member.version});
    return {accessToken,user:{id:user.id,name:user.name,phone:user.phone,role:dto.role,avatarUrl:user.avatarUrl,tenantId:tenant.id,tenantCode:tenant.code,tenantName:tenant.name,features:tenant.features,expiresAt:tenant.expires_at}};
  }
  async register(dto: RegisterDto) {
    if (dto.role !== AuthRole.CUSTOMER) throw new UnauthorizedException('员工账号须由本企业管理员开通');
    await this.verifyCode(dto.phone,dto.code);
    if (await this.customerRepo.findOne({where:{phone:dto.phone}})) throw new ConflictException('该手机号已注册，请直接登录');
    await this.customerRepo.save(this.customerRepo.create({phone:dto.phone,name:dto.name || '新客户'}));
    return this.login({...dto,code:'000000'});
  }
  async getProfile(userId: string, role: AuthRole) {
    let user: any;
    if (role === AuthRole.CUSTOMER) user = await this.customerRepo.findOne({where:{id:userId}});
    else if (role === AuthRole.ENGINEER) user = await this.engineerRepo.findOne({where:{id:userId}});
    else user = (await registry.query('SELECT subject_id AS id,name,phone FROM platform.memberships WHERE tenant_id=$1 AND subject_id=$2 AND role=$3',[currentTenant().id,userId,role])).rows[0];
    return {...user,tenantId:currentTenant().id,tenantCode:currentTenant().code,tenantName:currentTenant().name,features:currentTenant().features,expiresAt:currentTenant().expires_at};
  }
}
