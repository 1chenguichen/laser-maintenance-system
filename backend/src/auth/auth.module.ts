import { OrganizationLoginController, OrganizationLoginService } from './organization.controller.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Customer } from '../database/entities/customer.entity.js';
import { Engineer } from '../database/entities/engineer.entity.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: (() => { const secret = process.env.JWT_SECRET; if (!secret || secret.length < 32 || secret === 'laser-maintenance-secret-key' || secret.startsWith('your-')) throw new Error('Set JWT_SECRET to a random secret of at least 32 characters'); return secret; })(),
      signOptions: { expiresIn: '7d' },
    }),
    TypeOrmModule.forFeature([Customer, Engineer]),
    RedisModule,
  ],
  controllers: [AuthController,OrganizationLoginController],
  providers: [OrganizationLoginService,AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
