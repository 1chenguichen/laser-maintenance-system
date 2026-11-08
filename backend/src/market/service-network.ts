import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { registry } from '../tenancy/registry.js';
import { CATEGORIES } from './schema.js';

function id(value: any) {
  if (!isUUID(value)) throw new BadRequestException('企业或记录编号无效');
  return value;
}
function scope(value: any, category = false) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 30 ||
    value.some(
      (v) =>
        typeof v !== 'string' ||
        !v.trim() ||
        v.length > 50 ||
        (category && !CATEGORIES.includes(v)),
    )
  )
    throw new BadRequestException('请填写有效服务区域与类别');
  return [...new Set(value.map((v) => v.trim()))];
}
function covers(record: any, city: string, category: string) {
  return (
    (record.cities.includes('全国') || record.cities.includes(city)) &&
    record.categories.includes(category)
  );
}
@Injectable()
export class ServiceNetworkService {
  private access(a: any) {
    if (!['platform', 'company'].includes(a.kind))
      throw new ForbiddenException('无权管理服务网络');
  }
  async tenant(c: any, tenantId: string) {
    const row = (
      await c.query(
        "SELECT id,name FROM platform.tenants WHERE id=$1 AND enabled AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now())",
        [id(tenantId)],
      )
    ).rows[0];
    if (!row) throw new BadRequestException('服务企业不可用');
    return row;
  }
  async overview(a: any) {
    this.access(a);
    const all = a.kind === 'platform';
    return {
      profiles: (
        await registry.query(
          `SELECT t.id,t.name,coalesce(p.kind,'MERCHANT') kind,coalesce(p.service_mode,'PLATFORM') service_mode,p.contractor_id,ct.name contractor_name,p.cities,p.categories FROM platform.tenants t LEFT JOIN market.service_profiles p ON p.tenant_id=t.id LEFT JOIN platform.tenants ct ON ct.id=p.contractor_id WHERE t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) AND ($1::uuid IS NULL OR t.id=$1 OR p.kind IN ('OUTSOURCE','PLATFORM_SERVICE')) ORDER BY t.name`,
          [all ? null : a.tenantId],
        )
      ).rows,
      agreements: (
        await registry.query(
          `SELECT a.*,c.name client_name,p.name provider_name FROM market.service_agreements a JOIN platform.tenants c ON c.id=a.client_id JOIN platform.tenants p ON p.id=a.provider_id ${all ? '' : 'WHERE a.client_id=$1 OR a.provider_id=$1'} ORDER BY a.created_at DESC`,
          all ? [] : [a.tenantId],
        )
      ).rows,
      tenantId: all ? null : a.tenantId,
      engineers: all
        ? []
        : (
            await registry.query(
              `SELECT l.person_id,p.name,p.phone,e.state,e.cities FROM identity.links l JOIN identity.people p ON p.id=l.person_id AND p.enabled JOIN platform.memberships m ON m.tenant_id=l.tenant_id AND m.role='engineer' AND m.subject_id=l.local_id::text AND m.enabled LEFT JOIN market.engineers e ON e.person_id=l.person_id WHERE l.tenant_id=$1 AND l.role='engineer'`,
              [a.tenantId],
            )
          ).rows,
    };
  }
  async manage(a: any, b: any) {
    this.access(a);
    const c = await registry.connect();
    try {
      await c.query('BEGIN');
      if (b.type === 'profile') {
        const tenantId = a.kind === 'company' ? a.tenantId : id(b.tenantId);
        await this.tenant(c, tenantId);
        const previous = (
          await c.query(
            'SELECT * FROM market.service_profiles WHERE tenant_id=$1 FOR UPDATE',
            [tenantId],
          )
        ).rows[0];
        const kind =
          a.kind === 'platform' ? b.kind : previous?.kind || 'MERCHANT';
        if (
          !['MERCHANT', 'PLATFORM_SERVICE', 'OUTSOURCE'].includes(kind) ||
          !['SELF', 'PLATFORM', 'OUTSOURCE'].includes(b.serviceMode)
        )
          throw new BadRequestException('请选择有效企业类型与售后模式');
        const contractor =
          b.serviceMode === 'OUTSOURCE' ? id(b.contractorId) : null;
        if (contractor) {
          const agreement = (
            await c.query(
              "SELECT 1 FROM market.service_agreements WHERE client_id=$1 AND provider_id=$2 AND state='ACTIVE' FOR SHARE",
              [tenantId, contractor],
            )
          ).rows[0];
          if (!agreement)
            throw new BadRequestException('需先由外包企业确认合作关系');
          await this.tenant(c, contractor);
        }
        const cities = scope(b.cities || previous?.cities || ['全国']),
          categories = scope(
            b.categories || previous?.categories || CATEGORIES,
            true,
          );
        await c.query(
          `INSERT INTO market.service_profiles(tenant_id,kind,service_mode,contractor_id,cities,categories) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id) DO UPDATE SET kind=$2,service_mode=$3,contractor_id=$4,cities=$5,categories=$6,updated_at=now()`,
          [
            tenantId,
            kind,
            b.serviceMode,
            contractor,
            JSON.stringify(cities),
            JSON.stringify(categories),
          ],
        );
      } else if (b.type === 'agreement') {
        const client = a.kind === 'company' ? a.tenantId : id(b.clientId),
          provider = id(b.providerId);
        await this.tenant(c, client);
        await this.tenant(c, provider);
        if (client === provider)
          throw new BadRequestException('不能委托本企业');
        const p = (
          await c.query(
            "SELECT kind FROM market.service_profiles WHERE tenant_id=$1 AND kind IN ('OUTSOURCE','PLATFORM_SERVICE')",
            [provider],
          )
        ).rows[0];
        if (!p) throw new BadRequestException('请选择已登记的售后服务企业');
        const cities = scope(b.cities || ['全国']),
          categories = scope(b.categories || CATEGORIES, true);
        await c.query(
          'INSERT INTO market.service_agreements(id,client_id,provider_id,cities,categories) VALUES($1,$2,$3,$4,$5)',
          [
            randomUUID(),
            client,
            provider,
            JSON.stringify(cities),
            JSON.stringify(categories),
          ],
        );
      } else if (b.type === 'agreement-state') {
        const agreement = (
          await c.query(
            'SELECT * FROM market.service_agreements WHERE id=$1 FOR UPDATE',
            [id(b.id)],
          )
        ).rows[0];
        if (!agreement) throw new NotFoundException('合作关系不存在');
        if (!['ACTIVE', 'REJECTED', 'ENDED'].includes(b.state))
          throw new BadRequestException('合作状态无效');
        if (
          b.state !== 'ENDED' &&
          (a.kind !== 'company' || a.tenantId !== agreement.provider_id)
        )
          throw new ForbiddenException('需由承接企业确认合作');
        if (
          b.state === 'ENDED' &&
          a.kind === 'company' &&
          ![agreement.client_id, agreement.provider_id].includes(a.tenantId)
        )
          throw new ForbiddenException('无权终止该合作');
        if (
          b.state === 'ENDED'
            ? !['ACTIVE', 'PENDING'].includes(agreement.state)
            : agreement.state !== 'PENDING'
        )
          throw new ConflictException('合作状态已变化');
        await c.query(
          'UPDATE market.service_agreements SET state=$2,updated_at=now() WHERE id=$1',
          [agreement.id, b.state],
        );
        if (b.state === 'ENDED')
          await c.query(
            "UPDATE market.service_profiles SET service_mode='PLATFORM',contractor_id=NULL,updated_at=now() WHERE tenant_id=$1 AND contractor_id=$2",
            [agreement.client_id, agreement.provider_id],
          );
      } else throw new BadRequestException('不支持的服务网络操作');
      await c.query(
        'INSERT INTO market.events(id,actor_id,action,note) VALUES($1,$2,$3,$4)',
        [
          randomUUID(),
          a.id,
          'NETWORK_' + b.type,
          JSON.stringify({
            tenantId: b.tenantId || a.tenantId,
            id: b.id,
            providerId: b.providerId,
            state: b.state,
          }),
        ],
      );
      await c.query('COMMIT');
      return { message: '服务网络设置已保存' };
    } catch (e: any) {
      await c.query('ROLLBACK');
      if (e.code === '23505')
        throw new ConflictException('已有相同合作关系或平台自营服务企业');
      throw e;
    } finally {
      c.release();
    }
  }
  async route(
    c: any,
    requestId: string,
    commissioner: string | null,
    city: string,
    category: string,
  ) {
    if (!commissioner) return;
    const p = (
      await c.query(
        'SELECT * FROM market.service_profiles WHERE tenant_id=$1 FOR SHARE',
        [commissioner],
      )
    ).rows[0];
    if (!p || p.service_mode === 'PLATFORM') return;
    await this.tenant(c, commissioner);
    if (p.service_mode === 'SELF') {
      await c.query(
        "UPDATE market.requests SET assigned_provider_id=$2,delegation_state='ACCEPTED',dispatch_source='ENTERPRISE_SELF',service_kind_snapshot=$3 WHERE id=$1",
        [requestId, commissioner, p.kind],
      );
      return;
    }
    const agreement = (
      await c.query(
        "SELECT * FROM market.service_agreements WHERE client_id=$1 AND provider_id=$2 AND state='ACTIVE' FOR SHARE",
        [commissioner, p.contractor_id],
      )
    ).rows[0];
    if (!agreement || !covers(agreement, city, category))
      throw new BadRequestException(
        '当前外包合作未覆盖本次设备类别或城市，请联系服务企业调整售后安排',
      );
    const provider = (
      await c.query(
        'SELECT * FROM market.service_profiles WHERE tenant_id=$1',
        [p.contractor_id],
      )
    ).rows[0];
    await this.tenant(c, p.contractor_id);
    if (!provider || !covers(provider, city, category))
      throw new BadRequestException('外包服务企业暂不覆盖该服务区域或类别');
    await c.query(
      "UPDATE market.requests SET assigned_provider_id=$2,delegation_state='PENDING',dispatch_source='ENTERPRISE_OUTSOURCE',service_kind_snapshot='OUTSOURCE',agreement_id=$3 WHERE id=$1",
      [requestId, p.contractor_id, agreement.id],
    );
  }
  async action(a: any, requestId: string, b: any) {
    this.access(a);
    const c = await registry.connect();
    try {
      await c.query('BEGIN');
      const r = (
        await c.query('SELECT * FROM market.requests WHERE id=$1 FOR UPDATE', [
          id(requestId),
        ])
      ).rows[0];
      if (!r) throw new NotFoundException('服务单不存在');
      if (r.version !== b.version)
        throw new ConflictException('服务单已变化，请刷新');
      if (r.status !== 'REQUESTED' || r.engineer_id)
        throw new ConflictException('任务已派出，不可更改委托企业');
      if (b.action === 'delegate') {
        if (a.kind === 'company' && r.commissioner_id !== a.tenantId)
          throw new ForbiddenException('无权转委托其他企业的任务');
        if (
          r.delegation_state === 'PENDING' ||
          r.delegation_state === 'ACCEPTED'
        )
          throw new ConflictException('已有待处理的承接安排，请先撤回');
        const providerId = id(b.providerId);
        await this.tenant(c, providerId);
        const p = (
          await c.query(
            "SELECT * FROM market.service_profiles WHERE tenant_id=$1 AND kind IN ('OUTSOURCE','PLATFORM_SERVICE')",
            [providerId],
          )
        ).rows[0];
        if (!p || !covers(p, r.city, r.category))
          throw new BadRequestException('承接企业类型、服务城市或类别不符合');
        let agreement = null;
        if (a.kind === 'company') {
          agreement = (
            await c.query(
              "SELECT * FROM market.service_agreements WHERE client_id=$1 AND provider_id=$2 AND state='ACTIVE' FOR SHARE",
              [a.tenantId, providerId],
            )
          ).rows[0];
          if (!agreement || !covers(agreement, r.city, r.category))
            throw new ForbiddenException(
              '缺少覆盖该区域和设备类别的有效外包合作',
            );
        }
        if (r.provider_id && r.provider_id !== providerId)
          throw new BadRequestException('客户已选定服务企业，不可更换承接企业');
        await c.query(
          "UPDATE market.requests SET assigned_provider_id=$2,delegation_state='PENDING',dispatch_source=$3,agreement_id=$4,service_kind_snapshot=(SELECT kind FROM market.service_profiles WHERE tenant_id=$2),version=version+1,updated_at=now() WHERE id=$1",
          [
            r.id,
            providerId,
            a.kind === 'platform'
              ? 'PLATFORM_DELEGATED'
              : 'ENTERPRISE_OUTSOURCE',
            agreement?.id || null,
          ],
        );
      } else if (['delegate-accept', 'delegate-reject'].includes(b.action)) {
        if (a.kind !== 'company' || r.assigned_provider_id !== a.tenantId)
          throw new ForbiddenException('仅承接企业可处理委托');
        if (r.delegation_state !== 'PENDING')
          throw new ConflictException('委托状态已变化');
        await this.tenant(c, a.tenantId);
        if (b.action === 'delegate-accept' && r.agreement_id) {
          const active = (
            await c.query(
              "SELECT 1 FROM market.service_agreements WHERE id=$1 AND state='ACTIVE' FOR SHARE",
              [r.agreement_id],
            )
          ).rows[0];
          if (!active)
            throw new BadRequestException('原合作已终止，请联系平台重新安排');
        }
        await c.query(
          'UPDATE market.requests SET delegation_state=$2,version=version+1,updated_at=now() WHERE id=$1',
          [r.id, b.action === 'delegate-accept' ? 'ACCEPTED' : 'REJECTED'],
        );
      } else if (b.action === 'delegate-withdraw') {
        if (a.kind === 'company' && r.commissioner_id !== a.tenantId)
          throw new ForbiddenException('无权撤回委托');
        if (!['PENDING', 'ACCEPTED', 'REJECTED'].includes(r.delegation_state))
          throw new BadRequestException('没有可撤回的委托');
        await c.query(
          "UPDATE market.requests SET assigned_provider_id=NULL,delegation_state='NONE',dispatch_source='PLATFORM',service_kind_snapshot=NULL,agreement_id=NULL,version=version+1,updated_at=now() WHERE id=$1",
          [r.id],
        );
      } else throw new BadRequestException('不支持的委托操作');
      if (
        typeof b.note !== 'string' ||
        b.note.trim().length < 2 ||
        b.note.length > 500
      )
        throw new BadRequestException('请填写2至500字的安排说明');
      await c.query(
        'INSERT INTO market.events(id,request_id,actor_id,action,note) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), r.id, a.id, b.action, b.note],
      );
      await c.query('COMMIT');
      return { message: '委托安排已更新' };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async policy(a: any, tenantId: string) {
    id(tenantId);
    if (!['customer', 'engineer', 'company', 'platform'].includes(a.kind))
      throw new ForbiddenException();
    if (a.kind === 'customer' || a.kind === 'engineer') {
      const link = (
        await registry.query(
          'SELECT tenant_id FROM identity.links WHERE (id=$1 OR tenant_id=$1) AND person_id=$2',
          [tenantId, a.id],
        )
      ).rows[0];
      if (!link) throw new NotFoundException('服务关系不存在');
      tenantId = link.tenant_id;
    }
    await this.tenant(registry, tenantId);
    return (
      await registry.query(
        `SELECT t.id,t.name,coalesce(p.service_mode,'PLATFORM') service_mode,coalesce(p.kind,'MERCHANT') kind,ct.name contractor_name FROM platform.tenants t LEFT JOIN market.service_profiles p ON p.tenant_id=t.id LEFT JOIN platform.tenants ct ON ct.id=p.contractor_id WHERE t.id=$1`,
        [tenantId],
      )
    ).rows[0];
  }
}
