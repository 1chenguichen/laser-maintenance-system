import { tenantContext } from '../tenancy/context.js';
import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('未登录或登录已过期');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(token);
      if (payload.purpose !== 'access' || payload.membershipId !== tenantContext.getStore()?.user?.membershipId || payload.tenantId !== tenantContext.getStore()?.tenant?.id) throw new Error('Invalid tenant identity');
      (request as any).user = payload;

    } catch {
      throw new UnauthorizedException('未登录或登录已过期');
    }
    const allowed: string[] | undefined = Reflect.getMetadata('allowedRoles', context.getHandler()) || Reflect.getMetadata('allowedRoles', context.getClass());
    if (allowed && !allowed.includes(payload.role)) throw new ForbiddenException('当前角色无权执行此操作');
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}