import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IdentityService } from '../identity/identity.service.js';
import { IoTService } from './service.js';

@Injectable()
export class MobileAuth {
  constructor(
    private identity: IdentityService,
    private jwt: JwtService,
    private iot: IoTService,
  ) {}
  async context(actor: any) {
    const context = await this.iot.context(actor);
    const workspaces = context.workspaces.sort(
      (a: any, b: any) =>
        a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    const type = workspaces.length ? 'enterprise' : 'customer';
    const next =
      type === 'customer'
        ? 'home.html'
        : workspaces.length === 1
          ? 'business/index.html?workspace=' +
            encodeURIComponent(workspaces[0].id) +
            '&account=business'
          : 'business/choose.html';
    return { type, next, workspaces };
  }
  async login(body: any) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('登录信息无效');
    const result =
      body.mode === 'password'
        ? await this.identity.businessLogin(body.username, body.password)
        : await this.identity.login(body.phone, body.code, 'customer');
    const payload = this.jwt.verify(result.accessToken),
      user = result.user;
    const actor =
      payload.purpose === 'access'
        ? {
            kind: 'company',
            id: user.id,
            tenantId: user.tenantId,
            phone: user.phone,
            payload,
          }
        : { kind: 'customer', id: user.id, phone: user.phone, payload };
    // Identity is derived only after successful verification and authoritative membership lookup.
    return { ...result, mobile: await this.context(actor) };
  }
}
