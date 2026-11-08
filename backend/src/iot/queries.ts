import { BadRequestException } from '@nestjs/common';
import { registry } from '../tenancy/registry.js';
import { iotStore } from './store.js';
import type { IoTScope } from './access.js';
import { validId } from './contracts.js';

export function paging(q: any = {}) {
  const page = Number(q.page ?? 1),
    pageSize = Number(q.pageSize ?? 24);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new BadRequestException('分页参数无效，每页最多100条');
  return { page, pageSize };
}

// Only authoritative, active tenant identities enter the monitoring query.
export async function deviceQuery(s: IoTScope, q: any = {}) {
  const tenants = (
    await registry.query(
      "SELECT id,name FROM platform.tenants WHERE enabled AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now()) AND ($1::uuid IS NULL OR id=$1)",
      [s.tenantId || null],
    )
  ).rows;
  const subs = new Set(
    (
      await iotStore.query(
        'SELECT tenant_id FROM iot.subscriptions WHERE enabled AND (expires_at IS NULL OR expires_at>now())',
      )
    ).rows.map((r) => r.tenant_id),
  );
  const allowed = tenants.filter(
    (t) => s.kind === 'platform' || subs.has(t.id),
  );
  const values: any[] = [allowed.map((t) => t.id), s.assetIds ?? null];
  const params = (v: any) => {
    values.push(v);
    return '$' + values.length;
  };
  const alarmVisibility =
    s.kind === 'customer'
      ? "AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.metrics) m WHERE m->>'key'=a.metric AND m->>'customerVisible'='true')"
      : '';
  const base = `SELECT d.*, (SELECT count(*) FROM iot.alarms a WHERE a.asset_id=d.asset_id AND a.recovered_at IS NULL ${alarmVisibility})::int alarm_count, CASE WHEN NOT d.enabled THEN 'DISABLED' WHEN d.last_received_at IS NULL THEN 'NEVER' WHEN d.last_received_at>now()-make_interval(secs=>d.offline_after_seconds) THEN 'ONLINE' ELSE 'OFFLINE' END connectivity FROM iot.devices d WHERE d.tenant_id=ANY($1::uuid[]) AND ($2::uuid[] IS NULL OR d.asset_id=ANY($2::uuid[]))`;
  const conditions = ['true'];
  if (q.companyId) conditions.push(`tenant_id=${params(validId(q.companyId))}`);
  if (q.search) {
    if (typeof q.search !== 'string' || q.search.length > 100)
      throw new BadRequestException('搜索内容最多100字');
    const p = params('%' + q.search.replace(/[\\%_]/g, '\\$&') + '%');
    const names = allowed
      .filter((t) => t.name.toLowerCase().includes(q.search.toLowerCase()))
      .map((t) => t.id);
    conditions.push(
      `(model ILIKE ${p} OR serial ILIKE ${p} OR tenant_id=ANY(${params(names)}::uuid[]))`,
    );
  }
  if (q.province) {
    if (typeof q.province !== 'string' || q.province.length > 40)
      throw new BadRequestException('省份无效');
    conditions.push(`province=${params(q.province)}`);
  }
  if (q.status) {
    if (!['ONLINE', 'OFFLINE', 'NEVER', 'DISABLED', 'ALARM'].includes(q.status))
      throw new BadRequestException('状态无效');
    conditions.push(
      q.status === 'ALARM'
        ? 'alarm_count>0'
        : `connectivity=${params(q.status)}`,
    );
  }
  return {
    sql: `WITH scoped AS (${base}) SELECT * FROM scoped WHERE ${conditions.join(' AND ')}`,
    values,
    tenants: allowed,
  };
}
