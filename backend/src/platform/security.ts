import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, UnauthorizedException, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { registry } from '../tenancy/registry.js';
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt=randomBytes(16).toString('hex');
  const hash=await derive(password,salt,64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function checkPassword(password: string, stored: string) {
  const [salt,hex]=stored.split(':');
  const actual=await derive(password,salt,64) as Buffer, expected=Buffer.from(hex,'hex');
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(context: ExecutionContext) {
    const req=context.switchToHttp().getRequest();
    try {
      const [type,token]=(req.headers.authorization||'').split(' ');
      if(type!=='Bearer')throw Error('Missing token');
      const payload=this.jwt.verify(token);
      if(payload.purpose!=='platform_access' || payload.role!=='platform_admin')throw Error('Wrong identity');
      const admin=(await registry.query('SELECT id,username,name,version FROM platform.admins WHERE id=$1 AND enabled=true AND version=$2',[payload.sub,payload.version])).rows[0];
      if(!admin)throw Error('Account disabled');
      req.platformAdmin=admin;
      return true;
    }catch{throw new UnauthorizedException('请使用平台管理员账号重新登录');}
  }
}
