import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { map } from 'rxjs';
import { currentTenant } from './context.js';

export class FileTickets implements NestInterceptor {
  constructor(private jwt: JwtService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    if (!req.user || req.user.purpose !== 'access') return next.handle();
    const tenant = currentTenant();
    const rewrite = (value: any): any => {
      if (typeof value === 'string' && value.startsWith('/uploads/')) {
        let path = value.split('?')[0];
        if (tenant.code === 'demo' && path.startsWith('/uploads/fault-photos/')) path = `/uploads/${tenant.id}/` + path.slice('/uploads/'.length);
        if (!path.startsWith(`/uploads/${tenant.id}/`)) return null;
        const { sub, role, membershipId, version } = req.user;
        const ticket = this.jwt.sign({sub,role,membershipId,version,tenantId:tenant.id,purpose:'file',path}, {expiresIn:'15m'});
        return `${path}?ticket=${ticket}`;
      }
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,rewrite(v)]));
      return value;
    };
    return next.handle().pipe(map(rewrite));
  }
}
