import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { registry } from '../tenancy/registry.js';
import { businessClient, person, resource } from '../identity/store.js';
import { iotStore } from './store.js';
import { deviceQuery, paging } from './queries.js';
import { IoTAccess } from './access.js';
import type { IoTScope } from './access.js';
import { validId, text, metricModel, DEFAULT_METRICS } from './contracts.js';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
@Injectable()
export class IoTService {
  constructor(public access: IoTAccess) {}
  async audit(s: IoTScope, action: string, details: any = {}) {
    await iotStore.query(
      'INSERT INTO iot.audit(id,tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)',
      [
        randomUUID(),
        s.tenantId || null,
        s.actor.id,
        action,
        JSON.stringify(details),
      ],
    );
  }
  async context(a: any) {
    const workspaces = await this.access.workspaces(a);
    const rows = (
      await iotStore.query(
        'SELECT tenant_id,enabled,device_limit,expires_at FROM iot.subscriptions WHERE tenant_id=ANY($1::uuid[])',
        [workspaces.map((w) => w.id)],
      )
    ).rows;
    return {
      actor: a.kind,
      workspaces: workspaces.map((w) => ({
        ...w,
        subscription: (() => {
          const sub = rows.find((r) => r.tenant_id === w.id);
          return sub
            ? {
                ...sub,
                enabled:
                  sub.enabled &&
                  (!sub.expires_at || new Date(sub.expires_at) > new Date()),
                expired:
                  !!sub.expires_at && new Date(sub.expires_at) <= new Date(),
              }
            : { enabled: false };
        })(),
      })),
      defaultMetrics: DEFAULT_METRICS,
    };
  }
  async overview(s: IoTScope, q: any = {}) {
    if (s.tenantId) await this.access.subscription(s.tenantId);
    const scope = await deviceQuery(s, q);
    const aggregate = (
      await iotStore.query(
        `WITH filtered AS (${scope.sql}) SELECT count(*)::int total,count(*) FILTER(WHERE connectivity='ONLINE')::int online,count(*) FILTER(WHERE connectivity IN ('OFFLINE','NEVER'))::int offline,coalesce(sum(alarm_count),0)::int alarms,count(*) FILTER(WHERE simulated)::int simulated,count(DISTINCT tenant_id)::int companies FROM filtered`,
        scope.values,
      )
    ).rows[0];
    const provinces = (
      await iotStore.query(
        `WITH filtered AS (${scope.sql}) SELECT province,count(*)::int total FROM filtered GROUP BY province ORDER BY total DESC,province`,
        scope.values,
      )
    ).rows;
    const locations = (
      await iotStore.query(
        `WITH filtered AS (${scope.sql}) SELECT province,city,longitude::float longitude,latitude::float latitude,count(*)::int total,count(*) FILTER(WHERE connectivity='ONLINE')::int online,coalesce(sum(alarm_count),0)::int alarms FROM filtered WHERE longitude IS NOT NULL AND latitude IS NOT NULL GROUP BY province,city,longitude,latitude`,
        scope.values,
      )
    ).rows;
    let inventoryCount = aggregate.total;
    if (s.kind === 'platform' || s.kind === 'company')
      inventoryCount = Number(
        (
          await registry.query(
            "SELECT count(*) FROM identity.assets a JOIN platform.tenants t ON t.id=a.tenant_id WHERE ($1::uuid IS NULL OR a.tenant_id=$1) AND t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now())",
            [s.tenantId || null],
          )
        ).rows[0].count,
      );
    const attention =
      s.kind === 'platform'
        ? (
            await iotStore.query(
              `SELECT * FROM (${scope.sql}) filtered WHERE alarm_count>0 OR connectivity IN ('OFFLINE','NEVER') ORDER BY (alarm_count>0) DESC,alarm_count DESC,(connectivity='OFFLINE') DESC,created_at DESC,asset_id LIMIT 6`,
              scope.values,
            )
          ).rows.map((d) =>
            this.publicDevice(
              d,
              s,
              scope.tenants.find((t) => t.id === d.tenant_id),
            ),
          )
        : undefined;
    return {
      attention,
      inventoryCount,
      connectedCount: aggregate.total,
      companyCount: aggregate.companies,
      simulatedCount: aggregate.simulated,
      summary: aggregate,
      provinces,
      locations,
    };
  }
  async analytics(s: IoTScope, q: any = {}) {
    if (s.kind !== 'company' || !s.tenantId)
      throw new ForbiddenException('仅企业工作身份可查看企业统计');
    await this.access.subscription(s.tenantId);
    const scope = await deviceQuery(s, q);
    const statuses = (
      await iotStore.query(
        `SELECT connectivity status,count(*)::int total FROM (${scope.sql}) devices GROUP BY connectivity`,
        scope.values,
      )
    ).rows;
    const types = (
      await iotStore.query(
        `SELECT coalesce(nullif(device_type,''),'未分类') label,count(*)::int total FROM (${scope.sql}) devices GROUP BY label ORDER BY total DESC,label`,
        scope.values,
      )
    ).rows;
    const activity = (
      await iotStore.query(
        `WITH devices AS (${scope.sql}), hours AS(SELECT generate_series(date_trunc('hour',now())-interval '23 hours',date_trunc('hour',now()),interval '1 hour') at), counts AS(SELECT date_trunc('hour',s.recorded_at) at,count(*)::int total,count(DISTINCT s.asset_id)::int devices FROM iot.samples s JOIN devices d ON d.asset_id=s.asset_id WHERE s.recorded_at>=date_trunc('hour',now())-interval '23 hours' GROUP BY 1) SELECT h.at,coalesce(c.total,0)::int total,coalesce(c.devices,0)::int devices FROM hours h LEFT JOIN counts c USING(at) ORDER BY h.at`,
        scope.values,
      )
    ).rows;
    const alarms = (
      await iotStore.query(
        `WITH devices AS (${scope.sql}), days AS(SELECT generate_series((now() AT TIME ZONE 'Asia/Shanghai')::date-6,(now() AT TIME ZONE 'Asia/Shanghai')::date,interval '1 day') bucket_day), counts AS(SELECT (a.started_at AT TIME ZONE 'Asia/Shanghai')::date bucket_day,count(*)::int total FROM iot.alarms a JOIN devices d ON d.asset_id=a.asset_id WHERE a.started_at>=(((now() AT TIME ZONE 'Asia/Shanghai')::date-6)::timestamp AT TIME ZONE 'Asia/Shanghai') GROUP BY 1) SELECT to_char(d.bucket_day,'YYYY-MM-DD') AS "day",coalesce(c.total,0)::int total FROM days d LEFT JOIN counts c ON c.bucket_day=d.bucket_day::date ORDER BY d.bucket_day`,
        scope.values,
      )
    ).rows;
    return {
      statuses,
      types,
      activity,
      alarms,
      serverTime: new Date().toISOString(),
      timezone: 'Asia/Shanghai',
    };
  }
  async companies(s: IoTScope, q: any = {}) {
    if (s.kind !== 'platform')
      throw new ForbiddenException('仅平台可查看跨企业监测汇总');
    const scope = await deviceQuery(s, q),
      { page, pageSize } = paging({ ...q, pageSize: q.pageSize || 8 });
    const grouped = `WITH filtered AS (${scope.sql}) SELECT tenant_id,count(*)::int total,count(*) FILTER(WHERE connectivity='ONLINE')::int online,count(*) FILTER(WHERE connectivity='OFFLINE')::int offline,count(*) FILTER(WHERE connectivity='NEVER')::int never,count(*) FILTER(WHERE connectivity='DISABLED')::int disabled,coalesce(sum(alarm_count),0)::int alarms,max(last_received_at) latest_at FROM filtered GROUP BY tenant_id`;
    const total = Number(
      (
        await iotStore.query(
          `SELECT count(*) FROM (${grouped}) g`,
          scope.values,
        )
      ).rows[0].count,
    );
    const rows = (
      await iotStore.query(
        `${grouped} ORDER BY alarms DESC,total DESC,tenant_id LIMIT $${scope.values.length + 1} OFFSET $${scope.values.length + 2}`,
        [...scope.values, pageSize, (page - 1) * pageSize],
      )
    ).rows;
    return {
      companies: rows.map((r) => ({
        ...r,
        id: r.tenant_id,
        name: scope.tenants.find((t) => t.id === r.tenant_id)?.name || '企业',
        onlineRate: r.total ? Math.round((r.online / r.total) * 1000) / 10 : 0,
      })),
      total,
      page,
      pageSize,
    };
  }
  async tenants(s: IoTScope) {
    if (s.kind !== 'platform') throw new ForbiddenException();
    const tenants = (
        await registry.query(
          "SELECT id,name,enabled,code FROM platform.tenants WHERE provisioning_status='READY' ORDER BY created_at",
        )
      ).rows,
      subs = (await iotStore.query('SELECT * FROM iot.subscriptions')).rows;
    const counts = (
      await iotStore.query(
        'SELECT tenant_id,count(*)::int total FROM iot.devices GROUP BY tenant_id',
      )
    ).rows;
    return tenants.map((t) => ({
      ...t,
      connectedCount: counts.find((c) => c.tenant_id === t.id)?.total || 0,
      subscription: subs.find((r) => r.tenant_id === t.id) || {
        enabled: false,
        device_limit: 100,
        retention_days: 30,
      },
    }));
  }
  async subscribe(s: IoTScope, b: any) {
    if (s.kind !== 'platform') throw new ForbiddenException();
    const id = validId(b.tenantId);
    if (
      !(
        await registry.query('SELECT 1 FROM platform.tenants WHERE id=$1', [id])
      ).rowCount
    )
      throw new NotFoundException('企业不存在');
    if (
      typeof b.enabled !== 'boolean' ||
      !Number.isInteger(b.deviceLimit) ||
      b.deviceLimit < 1 ||
      b.deviceLimit > 100000 ||
      !Number.isInteger(b.retentionDays) ||
      b.retentionDays < 1 ||
      b.retentionDays > 3650
    )
      throw new BadRequestException('开通配置无效');
    if (
      b.expiresAt &&
      (!Number.isFinite(Date.parse(b.expiresAt)) ||
        new Date(b.expiresAt) <= new Date())
    )
      throw new BadRequestException('有效期必须在将来');
    await iotStore.query(
      'INSERT INTO iot.subscriptions(tenant_id,enabled,device_limit,retention_days,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET enabled=$2,device_limit=$3,retention_days=$4,expires_at=$5,updated_at=now()',
      [id, b.enabled, b.deviceLimit, b.retentionDays, b.expiresAt || null],
    );
    await this.audit(s, 'SUBSCRIPTION_UPDATED', {
      tenantId: id,
      enabled: b.enabled,
      limit: b.deviceLimit,
    });
    return { message: '物联网服务配置已更新' };
  }
  async asset(assetId: string) {
    const row = (
      await registry.query(
        "SELECT a.*,t.name tenant_name,t.database_name FROM identity.assets a JOIN platform.tenants t ON t.id=a.tenant_id WHERE a.id=$1 AND t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now())",
        [validId(assetId)],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('设备或企业不可用');
    return row;
  }
  async localDevice(asset: any) {
    const db = businessClient(asset.database_name);
    try {
      await db.connect();
      const d = (
        await db.query(
          'SELECT d.*,c.name customer_name,c.phone customer_phone FROM devices d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=$1',
          [asset.local_id],
        )
      ).rows[0];
      if (!d) throw new NotFoundException('设备档案不存在');
      return d;
    } finally {
      await db.end();
    }
  }
  async assets(s: IoTScope, q: any = {}) {
    this.access.manage(s, true);
    if (!s.tenantId) throw new BadRequestException('请选择企业空间');
    await this.access.subscription(s.tenantId);
    const { page, pageSize } = paging({ ...q, pageSize: q.pageSize || 100 });
    const search = text(q.search || '', '序列号搜索', 0, 100).replace(
      /[\\%_]/g,
      '\\$&',
    );
    const connected = (
      await iotStore.query(
        'SELECT asset_id FROM iot.devices WHERE tenant_id=$1',
        [s.tenantId],
      )
    ).rows.map((d) => d.asset_id);
    const values = [s.tenantId, '%' + search + '%', connected];
    const where =
      'tenant_id=$1 AND serial ILIKE $2 AND ($4::boolean=false OR NOT(id=ANY($3::uuid[])))';
    const available = q.available === 'true';
    const total = Number(
      (
        await registry.query(
          'SELECT count(*) FROM identity.assets WHERE ' + where,
          [...values, available],
        )
      ).rows[0].count,
    );
    const rows = (
      await registry.query(
        'SELECT id,local_id,serial FROM identity.assets WHERE ' +
          where +
          ' ORDER BY serial,id LIMIT $5 OFFSET $6',
        [...values, available, pageSize, (page - 1) * pageSize],
      )
    ).rows.map((r) => ({ ...r, connected: connected.includes(r.id) }));
    return q.page ? { assets: rows, total, page, pageSize } : rows;
  }
  async register(s: IoTScope, b: any) {
    this.access.manage(s, true);
    const asset = await this.asset(b.assetId);
    if (s.tenantId && s.tenantId !== asset.tenant_id)
      throw new NotFoundException('设备不属于当前企业');
    await this.access.subscription(asset.tenant_id);
    const local = await this.localDevice(asset),
      metrics = metricModel(b.metrics || DEFAULT_METRICS);
    const secret = randomBytes(32).toString('base64url');
    const client = await iotStore.connect();
    try {
      await client.query('BEGIN');
      const locked = (
        await client.query(
          'SELECT * FROM iot.subscriptions WHERE tenant_id=$1 FOR UPDATE',
          [asset.tenant_id],
        )
      ).rows[0];
      if (
        !locked?.enabled ||
        (locked.expires_at && new Date(locked.expires_at) <= new Date())
      )
        throw new ForbiddenException('物联网服务已停用或到期');
      if (
        (
          await client.query('SELECT 1 FROM iot.devices WHERE asset_id=$1', [
            asset.id,
          ])
        ).rowCount
      )
        throw new ConflictException('设备已接入，请使用配置或轮换凭证');
      const count = Number(
        (
          await client.query(
            'SELECT count(*) FROM iot.devices WHERE tenant_id=$1',
            [asset.tenant_id],
          )
        ).rows[0].count,
      );
      if (count >= locked.device_limit)
        throw new ForbiddenException('已达到物联网接入设备上限');
      const location = this.location(b);
      await client.query(
        'INSERT INTO iot.devices(asset_id,tenant_id,model,serial,device_type,province,city,address,longitude,latitude,simulated,credential_hash,metrics) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          asset.id,
          asset.tenant_id,
          local.model,
          local.serial_number,
          local.device_type,
          location.province,
          location.city,
          location.address,
          location.longitude,
          location.latitude,
          b.simulated === true,
          hash(secret),
          JSON.stringify(metrics),
        ],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    await this.audit(s, 'DEVICE_CONNECTED', {
      assetId: asset.id,
      simulated: b.simulated === true,
    });
    return {
      assetId: asset.id,
      deviceKey: secret,
      message: '设备接入凭证仅显示一次，请妥善保存',
    };
  }
  location(b: any) {
    const out: any = {
      province: text(b.province || '', '省份', 0, 40),
      city: text(b.city || '', '城市', 0, 40),
      address: text(b.address || '', '安装地址', 0, 200),
    };
    for (const [key, limit] of [
      ['longitude', 180],
      ['latitude', 90],
    ] as const) {
      const v = b[key];
      if (v !== undefined && v !== null && v !== '') {
        if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit)
          throw new BadRequestException('经纬度无效');
        out[key] = v;
      } else out[key] = null;
    }
    if ((out.longitude === null) !== (out.latitude === null))
      throw new BadRequestException('经纬度需要同时填写');
    return out;
  }
  async configure(s: IoTScope, id: string, b: any) {
    this.access.manage(s, true);
    const d = await this.access.device(s, id);
    const loc = this.location({
        ...d,
        longitude: d.longitude == null ? null : Number(d.longitude),
        latitude: d.latitude == null ? null : Number(d.latitude),
        ...b,
      }),
      metrics = metricModel(b.metrics || d.metrics);
    const offline = b.offlineAfterSeconds ?? d.offline_after_seconds;
    if (!Number.isInteger(offline) || offline < 10 || offline > 86400)
      throw new BadRequestException('离线判断需为10至86400秒');
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean')
      throw new BadRequestException('启用状态无效');
    const client = await iotStore.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT asset_id FROM iot.devices WHERE asset_id=$1 FOR UPDATE',
        [d.asset_id],
      );
      await client.query(
        'UPDATE iot.devices SET province=$2,city=$3,address=$4,longitude=$5,latitude=$6,metrics=$7,offline_after_seconds=$8,enabled=$9 WHERE asset_id=$1',
        [
          d.asset_id,
          loc.province,
          loc.city,
          loc.address,
          loc.longitude,
          loc.latitude,
          JSON.stringify(metrics),
          offline,
          b.enabled ?? d.enabled,
        ],
      );
      if (
        JSON.stringify(metrics) !== JSON.stringify(d.metrics) ||
        b.enabled === false
      ) {
        await client.query('DELETE FROM iot.rule_states WHERE asset_id=$1', [
          d.asset_id,
        ]);
        await client.query(
          'UPDATE iot.alarms SET recovered_at=now(),resolution_reason=$2 WHERE asset_id=$1 AND recovered_at IS NULL',
          [
            d.asset_id,
            b.enabled === false ? 'DEVICE_DISABLED' : 'RULE_CHANGED',
          ],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    await this.audit(s, 'DEVICE_CONFIGURED', { assetId: d.asset_id });
    return { message: '设备监控配置已保存' };
  }
  async rotate(s: IoTScope, id: string) {
    this.access.manage(s, true);
    const d = await this.access.device(s, id),
      key = randomBytes(32).toString('base64url');
    await iotStore.query(
      'UPDATE iot.devices SET credential_hash=$2,credential_version=credential_version+1 WHERE asset_id=$1',
      [d.asset_id, hash(key)],
    );
    await this.audit(s, 'DEVICE_KEY_ROTATED', { assetId: d.asset_id });
    return { deviceKey: key, message: '新凭证仅显示一次，旧凭证已失效' };
  }
  publicDevice(d: any, s: IoTScope, tenant: any) {
    const metrics =
      s.kind === 'customer'
        ? d.metrics.filter((m: any) => m.customerVisible)
        : d.metrics;
    const fresh =
      d.last_received_at &&
      Date.now() - new Date(d.last_received_at).getTime() <
        d.offline_after_seconds * 1000;
    return {
      id: d.asset_id,
      tenantId: d.tenant_id,
      companyName: tenant?.name || '企业',
      model: d.model,
      serialNumber: d.serial,
      deviceType: d.device_type,
      province: d.province,
      city: d.city,
      address: s.kind === 'platform' ? '' : d.address,
      longitude: d.longitude === null ? null : Number(d.longitude),
      latitude: d.latitude === null ? null : Number(d.latitude),
      simulated: d.simulated,
      enabled: d.enabled,
      connectivity: !d.enabled
        ? 'DISABLED'
        : !d.last_received_at
          ? 'NEVER'
          : fresh
            ? 'ONLINE'
            : 'OFFLINE',
      metricTimes: Object.fromEntries(
        metrics
          .filter((m: any) => d.metric_times?.[m.key])
          .map((m: any) => [m.key, d.metric_times[m.key]]),
      ),
      dataStale:
        !d.latest_at ||
        Date.now() - new Date(d.latest_at).getTime() >
          d.offline_after_seconds * 1000,
      latestAt: d.latest_at,
      lastReceivedAt: d.last_received_at,
      metrics,
      latest: Object.fromEntries(
        metrics
          .filter((m: any) => d.latest[m.key] !== undefined)
          .map((m: any) => [m.key, d.latest[m.key]]),
      ),
      alarmCount: Number(d.alarm_count || 0),
      offlineAfterSeconds: d.offline_after_seconds,
    };
  }
  async list(s: IoTScope, q: any = {}) {
    if (s.tenantId) await this.access.subscription(s.tenantId);
    const scope = await deviceQuery(s, q),
      { page, pageSize } = paging(q);
    const total = Number(
      (
        await iotStore.query(
          `SELECT count(*) FROM (${scope.sql}) result`,
          scope.values,
        )
      ).rows[0].count,
    );
    const rows = (
      await iotStore.query(
        `${scope.sql} ORDER BY created_at DESC,asset_id LIMIT $${scope.values.length + 1} OFFSET $${scope.values.length + 2}`,
        [...scope.values, pageSize, (page - 1) * pageSize],
      )
    ).rows;
    return {
      devices: rows.map((d) =>
        this.publicDevice(
          d,
          s,
          scope.tenants.find((t) => t.id === d.tenant_id),
        ),
      ),
      total,
      page,
      pageSize,
      serverTime: new Date().toISOString(),
    };
  }
  async devices(s: IoTScope) {
    return (await this.list(s, { pageSize: 100 })).devices;
  }
  async detail(s: IoTScope, id: string) {
    const d = await this.access.device(s, id),
      asset = await this.asset(d.asset_id);
    const tenant = (
      await registry.query('SELECT name FROM platform.tenants WHERE id=$1', [
        d.tenant_id,
      ])
    ).rows[0];
    d.alarm_count = Number(
      (
        await iotStore.query(
          "SELECT count(*) FROM iot.alarms WHERE asset_id=$1 AND recovered_at IS NULL AND ($2::boolean OR metric IN(SELECT m->>'key' FROM jsonb_array_elements($3::jsonb) m WHERE m->>'customerVisible'='true'))",
          [d.asset_id, s.kind !== 'customer', JSON.stringify(d.metrics)],
        )
      ).rows[0].count,
    );
    const row = this.publicDevice(d, s, tenant);
    const local = await this.localDevice(asset);
    const deviceRef = await resource(asset.tenant_id, 'device', asset.local_id);
    if (s.kind === 'platform')
      await this.audit(s, 'DEVICE_DETAIL_VIEWED', { assetId: d.asset_id });
    return {
      ...row,
      deviceRef,
      customer:
        s.kind === 'company'
          ? {
              name: local.customer_name || '未绑定客户',
              bound: !!local.customer_id,
            }
          : undefined,
    };
  }
  async history(s: IoTScope, id: string, query: any) {
    const d = await this.access.device(s, id),
      hours = Number(query.hours || 24);
    if (!Number.isFinite(hours) || hours < 1 || hours > 8760)
      throw new BadRequestException('请选择1至8760小时');
    const sub = await this.access.subscription(d.tenant_id),
      window = Math.min(hours, sub.retention_days * 24),
      metric =
        query.metric ||
        d.metrics.find((m: any) => s.kind !== 'customer' || m.customerVisible)
          ?.key;
    if (
      !d.metrics.some(
        (m: any) =>
          m.key === metric && (s.kind !== 'customer' || m.customerVisible),
      )
    )
      throw new ForbiddenException('指标不可见');
    const rows = (
      await iotStore.query(
        "SELECT floor(extract(epoch from recorded_at)/$4)::bigint bucket,avg((values->>$3)::numeric)::float value,min(recorded_at) at FROM iot.samples WHERE asset_id=$1 AND recorded_at>now()-($2::text||' hours')::interval AND values ? $3 GROUP BY bucket ORDER BY bucket",
        [
          d.asset_id,
          window,
          metric,
          Math.max(10, Math.ceil((window * 3600) / 180)),
        ],
      )
    ).rows;
    return { metric, points: rows.map((r) => ({ at: r.at, value: r.value })) };
  }
  async alarmPage(s: IoTScope, q: any = {}) {
    if (s.tenantId) await this.access.subscription(s.tenantId);
    const scope = await deviceQuery(s, q),
      { page, pageSize } = paging(q);
    if (q.deviceId) {
      const d = await this.access.device(s, q.deviceId);
      scope.values.push(d.asset_id);
      scope.sql += ` AND asset_id=$${scope.values.length}`;
    }
    const base = `FROM iot.alarms a JOIN (${scope.sql}) d ON d.asset_id=a.asset_id WHERE true ${q.status === 'ALARM' ? 'AND a.recovered_at IS NULL' : ''} ${s.kind === 'customer' ? "AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.metrics) m WHERE m->>'key'=a.metric AND m->>'customerVisible'='true')" : ''}`;
    const total = Number(
      (await iotStore.query('SELECT count(*) ' + base, scope.values)).rows[0]
        .count,
    );
    const rows = (
      await iotStore.query(
        `SELECT a.*,d.model,d.serial,d.metrics ${base} ORDER BY a.started_at DESC,a.id LIMIT $${scope.values.length + 1} OFFSET $${scope.values.length + 2}`,
        [...scope.values, pageSize, (page - 1) * pageSize],
      )
    ).rows;
    return {
      total,
      page,
      pageSize,
      alarms: rows.map((r) => ({
        id: r.id,
        deviceId: r.asset_id,
        model: r.model,
        serialNumber: r.serial,
        companyName: scope.tenants.find((t) => t.id === r.tenant_id)?.name,
        metric: r.metric,
        label: r.label,
        level: r.level,
        value: Number(r.value),
        threshold: r.threshold,
        startedAt: r.started_at,
        recoveredAt: r.recovered_at,
        resolutionReason: r.resolution_reason,
        acknowledgedAt: r.acknowledged_at,
        note: r.ack_note,
        ticketId: r.ticket_id,
        ticketNumber: r.ticket_number,
        snapshot:
          s.kind === 'customer'
            ? Object.fromEntries(
                r.metrics
                  .filter(
                    (m: any) =>
                      m.customerVisible && r.snapshot[m.key] !== undefined,
                  )
                  .map((m: any) => [m.key, r.snapshot[m.key]]),
              )
            : r.snapshot,
      })),
    };
  }
  async alarms(s: IoTScope, q: any = {}) {
    return (await this.alarmPage(s, { ...q, pageSize: 100 })).alarms;
  }
  async acknowledge(s: IoTScope, id: string, b: any) {
    this.access.manage(s);
    const alarm = (
      await iotStore.query('SELECT * FROM iot.alarms WHERE id=$1', [
        validId(id),
      ])
    ).rows[0];
    if (!alarm) throw new NotFoundException('告警不存在');
    await this.access.device(s, alarm.asset_id);
    const note = text(b.note, '处理说明', 2, 500);
    await iotStore.query(
      'UPDATE iot.alarms SET acknowledged_at=now(),acknowledged_by=$2,ack_note=$3 WHERE id=$1',
      [id, s.actor.id, note],
    );
    await this.audit(s, 'ALARM_ACKNOWLEDGED', { alarmId: id });
    return { message: '告警处理记录已保存' };
  }
  async members(s: IoTScope) {
    this.access.manage(s, true);
    if (!s.tenantId) throw new BadRequestException('请选择企业');
    const rows = (
        await iotStore.query(
          'SELECT id,person_id,role,asset_ids,enabled FROM iot.members WHERE tenant_id=$1',
          [s.tenantId],
        )
      ).rows,
      persons = (
        await registry.query(
          'SELECT id,name,phone FROM identity.people WHERE id=ANY($1::uuid[])',
          [rows.map((r) => r.person_id)],
        )
      ).rows;
    return rows.map((r) => ({
      ...r,
      ...{ person: persons.find((p) => p.id === r.person_id) },
    }));
  }
  async saveMember(s: IoTScope, b: any) {
    this.access.manage(s, true);
    if (!s.tenantId) throw new BadRequestException('请选择企业');
    await this.access.subscription(s.tenantId);
    if (
      !/^1[3-9]\d{9}$/.test(b.phone) ||
      !['viewer', 'operator', 'admin'].includes(b.role) ||
      typeof b.enabled !== 'boolean'
    )
      throw new BadRequestException('员工信息无效');
    let ids = null;
    if (Array.isArray(b.assetIds)) {
      if (b.assetIds.length > 1000)
        throw new BadRequestException('授权设备过多');
      ids = [...new Set<string>(b.assetIds.map(validId))];
      const valid = (
        await iotStore.query(
          'SELECT asset_id FROM iot.devices WHERE tenant_id=$1 AND asset_id=ANY($2::uuid[])',
          [s.tenantId, ids],
        )
      ).rows;
      if (valid.length !== ids.length)
        throw new BadRequestException('授权设备不属于当前企业');
    } else if (b.assetIds !== undefined && b.assetIds !== null)
      throw new BadRequestException('设备范围无效');
    if (b.role === 'admin' && ids !== null)
      throw new BadRequestException(
        '物联网管理员管理全部设备，限制设备范围请使用查看或处理角色',
      );
    const p = await person(b.phone, text(b.name || '企业成员', '姓名', 1, 40));
    await iotStore.query(
      'INSERT INTO iot.members(id,tenant_id,person_id,role,asset_ids,enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,person_id) DO UPDATE SET role=$4,asset_ids=$5,enabled=$6',
      [randomUUID(), s.tenantId, p.id, b.role, ids, b.enabled],
    );
    await this.audit(s, 'MEMBER_UPDATED', {
      personId: p.id,
      role: b.role,
      enabled: b.enabled,
    });
    return { message: '企业手机工作台权限已保存' };
  }
}
