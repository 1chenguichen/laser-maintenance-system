import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../database/entities/customer.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { EngineerStatus } from '../database/entities/enums.js';
import { RedisService } from '../redis/redis.service.js';
import { LoginDto, RegisterDto, AuthRole } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Customer) private customerRepo: Repository<Customer>,
    @InjectRepository(Engineer) private engineerRepo: Repository<Engineer>,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  // 发送验证码
  async sendCode(phone: string): Promise<{ message: string }> {
    // 生成6位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // 存入 Redis，5分钟过期
    await this.redisService.setCode(phone, code);

    // TODO: 实际调用短信服务发送验证码
    console.log(`[Mock SMS] Phone: ${phone}, Code: ${code}`);

    return { message: '验证码已发送' };
  }

  // 手机号登录
  async login(dto: LoginDto): Promise<{ accessToken: string; user: any }> {
    let user: any;

    // 测试模式：验证码 000000 可以直接登录（跳过验证码验证）
    const isTestMode = dto.code === '000000';

    if (!isTestMode) {
      // 验证验证码
      const stored = await this.redisService.getCode(dto.phone);
      if (!stored || stored !== dto.code) {
        throw new BadRequestException('验证码已过期或无效');
      }
      await this.redisService.delCode(dto.phone);
    }

    if (dto.role === AuthRole.CUSTOMER) {
      user = await this.customerRepo.findOne({ where: { phone: dto.phone } });
      if (!user) {
        // 新用户自动注册
        user = this.customerRepo.create({ phone: dto.phone, name: '新客户' });
        user = await this.customerRepo.save(user);
      }
    } else if (dto.role === AuthRole.ENGINEER) {
      user = await this.engineerRepo.findOne({ where: { phone: dto.phone } });
      if (!user) {
        throw new UnauthorizedException('该工程师不存在，请联系客服开通账号');
      }
    } else if (dto.role === AuthRole.CS_OPERATOR) {
      // 客服账号测试模式：使用固定ID
      user = {
        id: 'cs-admin-001',
        name: '客服管理员',
        phone: dto.phone,
        role: AuthRole.CS_OPERATOR,
      };
    } else {
      throw new UnauthorizedException('不支持的角色类型');
    }

    const payload = { sub: user.id, role: dto.role, phone: user.phone };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: dto.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  // 注册
  async register(dto: RegisterDto): Promise<{ accessToken: string; user: any }> {
    const isTestMode = dto.code === '000000';

    if (!isTestMode) {
      const stored = await this.redisService.getCode(dto.phone);
      if (!stored || stored !== dto.code) {
        throw new BadRequestException('验证码已过期或无效');
      }
      await this.redisService.delCode(dto.phone);
    }

    // 检查手机号是否已注册
    if (dto.role === AuthRole.CUSTOMER) {
      const existing = await this.customerRepo.findOne({ where: { phone: dto.phone } });
      if (existing) {
        throw new ConflictException('该手机号已注册，请直接登录');
      }
      const user = this.customerRepo.create({
        phone: dto.phone,
        name: dto.name || '新客户',
      });
      await this.customerRepo.save(user);
    } else if (dto.role === AuthRole.ENGINEER) {
      const existing = await this.engineerRepo.findOne({ where: { phone: dto.phone } });
      if (existing) {
        throw new ConflictException('该手机号已注册，请直接登录');
      }
      const user = this.engineerRepo.create({
        phone: dto.phone,
        name: dto.name || '新工程师',
        status: EngineerStatus.OFFLINE,
        joinedAt: new Date(),
      });
      await this.engineerRepo.save(user);
    } else {
      throw new UnauthorizedException('不支持的角色类型');
    }

    // 获取注册后的用户信息
    let newUser: any;
    if (dto.role === AuthRole.CUSTOMER) {
      newUser = await this.customerRepo.findOne({ where: { phone: dto.phone } });
    } else {
      newUser = await this.engineerRepo.findOne({ where: { phone: dto.phone } });
    }

    const payload = { sub: newUser.id, role: dto.role, phone: newUser.phone };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        role: dto.role,
        avatarUrl: newUser.avatarUrl,
      },
    };
  }

  // 获取用户信息
  async getProfile(userId: string, role: AuthRole) {
    if (role === AuthRole.CUSTOMER) {
      return this.customerRepo.findOne({ where: { id: userId } });
    } else if (role === AuthRole.ENGINEER) {
      return this.engineerRepo.findOne({ where: { id: userId } });
    }
    return null;
  }
}
