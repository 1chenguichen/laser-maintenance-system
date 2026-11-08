import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { registry, validateIdentity } from '../tenancy/registry.js';
import { businessClient, personLinks } from '../identity/store.js';
import { iotStore } from './store.js';
import { validId } from './contracts.js';
export interface IoTScope {
  kind: string;
  tenantId?: string;
  personId?: string;
  role: string;
  assetIds?: string[];
  actor: any;
}
@Injectable()
export class IoTAccess {
  async workspaces(a: any) {
    if (a.kind === 'company') {
      const t = (
        await registry.query(
          'SELECT id,name FROM platform.tenants WHERE id=$1',
          [a.tenantId],
        )
      ).rows[0];
      return [{ ...t, role: 'admin' }];
    }
    if (!['customer', 'engineer'].includes(a.kind)) return [];
    const candidates = (
      await registry.query(
        "SELECT DISTINCT t.id,t.name FROM platform.tenants t LEFT JOIN platform.memberships m ON m.tenant_id=t.id AND m.phone=$1 AND m.role='cs_operator' AND m.enabled WHERE t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) AND ($2<>'demo' OR t.demo_auth) AND (m.id IS NOT NULL OR t.id=ANY($3::uuid[]))",
        [
          a.phone,
          a.payload.amr || 'demo',
          (
            await iotStore.query(
              'SELECT tenant_id FROM iot.members WHERE person_id=$1 AND enabled',
              [a.id],
            )
          ).rows.map((m) => m.tenant_id),
        ],
      )
    ).rows;
    const out = [];
    for (const t of candidates) {
      const admin = (
        await registry.query(
          "SELECT 1 FROM platform.memberships WHERE tenant_id=$1 AND phone=$2 AND role='cs_operator' AND enabled",
          [t.id, a.phone],
        )
      ).rowCount;
      const member = (
        await iotStore.query(
          'SELECT role FROM iot.members WHERE tenant_id=$1 AND person_id=$2 AND enabled',
          [t.id, a.id],
        )
      ).rows[0];
      if (admin || member)
        out.push({ ...t, role: admin ? 'admin' : member.role });
    }
    return out;
  }
  async scope(a: any, workspace?: string): Promise<IoTScope> {
    if (a.kind === 'platform')
      return { kind: 'platform', role: 'admin', actor: a };
    if (a.kind === 'company') {
      if (workspace && workspace !== a.tenantId)
        throw new ForbiddenException('企业身份不匹配');
      return { kind: 'company', tenantId: a.tenantId, role: 'admin', actor: a };
    }
    if (workspace) {
      validId(workspace);
      const allowed = (await this.workspaces(a)).find(
        (w) => w.id === workspace,
      );
      if (!allowed) throw new ForbiddenException('没有此企业的授权');
      const member = (
        await iotStore.query(
          'SELECT asset_ids FROM iot.members WHERE tenant_id=$1 AND person_id=$2 AND enabled',
          [workspace, a.id],
        )
      ).rows[0];
      return {
        kind: 'company',
        tenantId: workspace,
        role: allowed.role,
        assetIds:
          allowed.role === 'admin' ? undefined : member?.asset_ids || undefined,
        personId: a.id,
        actor: a,
      };
    }
    if (!['customer', 'engineer'].includes(a.kind))
      throw new ForbiddenException('当前身份无权查看设备');
    const ids: string[] = [];
    if (a.kind === 'customer')
      throw new ForbiddenException('物联网仅向获授权的企业工作身份开放');
    {
      ids.push(
        ...(
          await registry.query(
            "SELECT a.id FROM market.requests r JOIN identity.resources ref ON ref.id=r.device_ref AND ref.kind='device' JOIN identity.assets a ON a.tenant_id=ref.tenant_id AND a.local_id=ref.local_id WHERE r.engineer_id=$1 AND r.status NOT IN ('COMPLETED','CANCELLED')",
            [a.id],
          )
        ).rows.map((r) => r.id),
      );
      for (const link of await personLinks(a.payload)) {
        const db = businessClient(link.database_name);
        try {
          await db.connect();
          const ds = (
            await db.query(
              "SELECT device_id FROM work_orders WHERE engineer_id=$1 AND status NOT IN ('COMPLETED','CANCELLED')",
              [link.local_id],
            )
          ).rows.map((d) => d.device_id);
          ids.push(
            ...(
              await registry.query(
                'SELECT id FROM identity.assets WHERE tenant_id=$1 AND local_id=ANY($2::uuid[])',
                [link.id, ds],
              )
            ).rows.map((r) => r.id),
          );
        } finally {
          await db.end();
        }
      }
    }
    return {
      kind: a.kind,
      role: 'viewer',
      assetIds: [...new Set(ids)],
      personId: a.id,
      actor: a,
    };
  }
  async subscription(tenantId: string) {
    const tenant = (
      await registry.query(
        "SELECT id FROM platform.tenants WHERE id=$1 AND enabled AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now())",
        [tenantId],
      )
    ).rows[0];
    const row = (
      await iotStore.query(
        'SELECT * FROM iot.subscriptions WHERE tenant_id=$1',
        [tenantId],
      )
    ).rows[0];
    if (
      !tenant ||
      !row?.enabled ||
      (row.expires_at && new Date(row.expires_at) <= new Date())
    )
      throw new ForbiddenException('企业尚未开通物联网或服务已到期');
    return row;
  }
  async device(scope: IoTScope, id: string) {
    validId(id);
    let row = (
      await iotStore.query('SELECT * FROM iot.devices WHERE asset_id=$1', [id])
    ).rows[0];
    if (!row) {
      const map = (
        await registry.query(
          "SELECT a.id FROM identity.resources r JOIN identity.assets a ON a.tenant_id=r.tenant_id AND a.local_id=r.local_id WHERE r.id=$1 AND r.kind='device'",
          [id],
        )
      ).rows[0];
      if (map)
        row = (
          await iotStore.query('SELECT * FROM iot.devices WHERE asset_id=$1', [
            map.id,
          ])
        ).rows[0];
    }
    if (!row && scope.kind === 'company' && scope.tenantId) {
      const a = (
        await registry.query(
          'SELECT id FROM identity.assets WHERE tenant_id=$1 AND local_id=$2',
          [scope.tenantId, id],
        )
      ).rows[0];
      if (a)
        row = (
          await iotStore.query('SELECT * FROM iot.devices WHERE asset_id=$1', [
            a.id,
          ])
        ).rows[0];
    }
    if (
      !row ||
      (scope.tenantId && row.tenant_id !== scope.tenantId) ||
      (scope.assetIds && !scope.assetIds.includes(row.asset_id))
    )
      throw new NotFoundException('设备未接入或当前身份无权查看');
    await this.subscription(row.tenant_id);
    return row;
  }
  manage(scope: IoTScope, admin = false) {
    if (
      scope.kind !== 'platform' &&
      (scope.kind !== 'company' ||
        !['admin', ...(admin ? [] : ['operator'])].includes(scope.role))
    )
      throw new ForbiddenException('没有此操作权限');
  }
}
