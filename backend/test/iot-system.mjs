import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import { JwtService } from '@nestjs/jwt';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
const database = (
  await fs.readFile(path.join(root, '.local-preview/database.txt'), 'utf8')
).trim();
const connection = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
};
const db = new pg.Client({ ...connection, database });
const iot = new pg.Client({
  ...connection,
  database: process.env.IOT_DATABASE || database + '_iot',
});
await db.connect();
await iot.connect();
const seed = JSON.parse(
  await fs.readFile(path.join(root, '.local-preview/iot-devices.json'), 'utf8'),
);
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const fixtures = [],
  requests = [];
let memberPerson, browser, browserContext, savedSubscription;
const bulkIds = [];
async function api(route, token, body, status = 200, deviceKey) {
  const r = await fetch('http://localhost:8180' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + (token || ''),
      'Content-Type': 'application/json',
      ...(deviceKey ? { 'X-Device-Key': deviceKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await r.json();
  if (status < 400)
    assert(r.ok, route + ' ' + r.status + ' ' + JSON.stringify(value));
  else assert.equal(r.status, status, route + ' ' + JSON.stringify(value));
  return value;
}
async function company(id) {
  const m = (
    await db.query(
      "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",
      [id],
    )
  ).rows[0];
  return jwt.sign(
    {
      sub: m.subject_id,
      tenantId: id,
      membershipId: m.id,
      version: m.version,
      phone: m.phone,
      role: 'cs_operator',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
}
try {
  const owner = seed.companies[1],
    foreign = seed.companies[2],
    token = await company(owner.id),
    other = await company(foreign.id);
  savedSubscription = (
    await iot.query('SELECT * FROM iot.subscriptions WHERE tenant_id=$1', [
      owner.id,
    ])
  ).rows[0];
  const customer = await api('/identity/login', null, {
    phone: seed.customerPhone,
    code: '000000',
    role: 'customer',
  });
  const localCustomer = (await api('/admin/customers', token)).find(
    (c) => c.phone === seed.customerPhone,
  );
  const device = await api('/admin/devices', token, {
    customerId: localCustomer.id,
    serialNumber: 'IOT-TEST-' + randomUUID(),
    model: '物联网测试焊接机',
    deviceType: '激光焊接机',
  });
  const label = await api('/admin/devices/' + device.id + '/claim-link', token);
  fixtures.push({
    tenant: owner.id,
    localId: device.id,
    assetId: label.assetKey,
  });
  const metrics = (await api('/iot/context', token)).defaultMetrics.map(
    (m) => ({ ...m, durationSeconds: 0 }),
  );
  const registered = await api('/iot/devices', token, {
    assetId: label.assetKey,
    metrics,
    simulated: true,
    province: '广东省',
    city: '深圳市',
  });
  const id = registered.assetId,
    key = registered.deviceKey;
  await api('/iot/devices/' + id, other, undefined, 404);
  await api(
    '/iot/devices/' + id + '/history?metric=vibration',
    customer.accessToken,
    undefined,
    403,
  );
  await api('/iot/devices/' + id, customer.accessToken, undefined, 403);
  await api('/iot/devices', customer.accessToken, undefined, 403);
  const sample = {
    sampleId: randomUUID(),
    recordedAt: new Date(Date.now() - 1000).toISOString(),
    values: { temperature: 60, current: 18, runtime: 123, vibration: 2 },
  };
  await api(
    '/iot/ingest',
    null,
    sample,
    401,
    'incorrect-device-credential-000000000',
  );
  await api(
    '/iot/ingest',
    null,
    { ...sample, assetId: seed.devices[0].assetId },
    403,
    key,
  );
  await api(
    '/iot/ingest',
    null,
    { ...sample, values: { unknown: 1 } },
    400,
    key,
  );
  await api(
    '/iot/ingest',
    null,
    { ...sample, recordedAt: new Date(Date.now() + 86400000).toISOString() },
    400,
    key,
  );
  assert((await api('/iot/ingest', null, sample, 200, key)).accepted);
  assert((await api('/iot/ingest', null, sample, 200, key)).duplicate);
  await api(
    '/iot/ingest',
    null,
    { ...sample, values: { temperature: 61 } },
    409,
    key,
  );
  await api(
    '/iot/ingest',
    null,
    {
      ...sample,
      sampleId: randomUUID(),
      recordedAt: new Date(Date.now() - 50000).toISOString(),
      values: { temperature: 20 },
    },
    200,
    key,
  );
  assert.equal((await api('/iot/devices/' + id, token)).latest.temperature, 60);
  const alarm = (await api('/iot/alarms', token)).find(
    (a) => a.deviceId === id && !a.recoveredAt,
  );
  assert(alarm, 'duration=0 must immediately create an alarm');
  await api(
    '/iot/ingest',
    null,
    { ...sample, sampleId: randomUUID(), recordedAt: new Date().toISOString() },
    200,
    key,
  );
  assert.equal(
    (await api('/iot/alarms', token)).filter(
      (a) => a.deviceId === id && !a.recoveredAt,
    ).length,
    1,
  );
  await api('/iot/alarms', customer.accessToken, undefined, 403);
  await api(
    '/iot/alarms/' + alarm.id + '/acknowledge',
    customer.accessToken,
    { note: '客户不得处理告警' },
    403,
  );
  await api('/iot/alarms/' + alarm.id + '/acknowledge', token, {
    note: '验证告警处理记录',
  });
  console.log(
    'PASS tenant/device credentials, timestamps, idempotent ingestion, public metric privacy and alarm deduplication',
  );

  const phone = '13797' + String(Date.now()).slice(-6);
  const login = await api('/identity/login', null, {
    phone,
    code: '000000',
    role: 'customer',
  });
  memberPerson = login.user.id;
  await api('/iot/members', token, {
    phone,
    name: '临时权限验证员工',
    role: 'viewer',
    enabled: true,
    assetIds: [id],
  });
  const space = '?workspace=' + owner.id;
  assert.equal(
    (await api('/iot/devices' + space, login.accessToken)).devices.length,
    1,
  );
  await api(
    '/iot/devices/' +
      seed.devices.find((d) => d.tenantId === owner.id).assetId +
      space,
    login.accessToken,
    undefined,
    404,
  );
  await api(
    '/iot/devices/' + id + '/credential' + space,
    login.accessToken,
    {},
    403,
  );
  await api(
    '/iot/alarms/' + alarm.id + '/acknowledge' + space,
    login.accessToken,
    { note: '越权验证' },
    403,
  );
  await api('/iot/members', token, {
    phone,
    name: '临时权限验证员工',
    role: 'operator',
    enabled: true,
    assetIds: [id],
  });
  await api(
    '/iot/alarms/' + alarm.id + '/acknowledge' + space,
    login.accessToken,
    { note: '获授权处理本设备告警' },
  );
  await api(
    '/iot/members' + space,
    login.accessToken,
    { phone, name: '越权', role: 'admin', enabled: true, assetIds: null },
    403,
  );
  browser = await chromium.connectOverCDP('http://127.0.0.1:9324');
  browserContext = await browser.newContext();
  const livePage = await browserContext.newPage();
  await livePage.goto('http://localhost:3101/login.html');
  await livePage.addScriptTag({
    url: 'http://localhost:8180/socket.io/socket.io.js',
  });
  await livePage.evaluate(
    ({ token, workspace }) => {
      window.iotTestSnapshots = 0;
      window.iotTestRevoked = false;
      window.iotTestSocket = window.io('http://localhost:8180/iot', {
        auth: { token },
      });
      window.iotTestSocket.on('connect', () =>
        window.iotTestSocket.emit('watch', { workspace }),
      );
      window.iotTestSocket.on('snapshot', () => window.iotTestSnapshots++);
      window.iotTestSocket.on(
        'iot-error',
        () => (window.iotTestRevoked = true),
      );
    },
    { token: login.accessToken, workspace: owner.id },
  );
  await livePage.waitForFunction(() => window.iotTestSnapshots > 0);
  await api('/iot/members', token, {
    phone,
    name: '临时权限验证员工',
    role: 'operator',
    enabled: false,
    assetIds: [id],
  });
  await api('/iot/devices' + space, login.accessToken, undefined, 403);
  await livePage.waitForFunction(
    () => window.iotTestRevoked,
    {},
    { timeout: 12000 },
  );
  assert.equal(
    await livePage.evaluate(() => window.iotTestSocket.connected),
    false,
  );
  console.log(
    'PASS enterprise mobile role, per-device scope and immediate authorization revocation',
  );

  const body = {
    city: '深圳市',
    address: '物联网测试地址（模拟）',
    note: '测试告警手动转单与重复点击幂等性',
  };
  const created = await Promise.all([
    api('/iot/alarms/' + alarm.id + '/ticket', token, body),
    api('/iot/alarms/' + alarm.id + '/ticket', token, body),
  ]);
  requests.push(...new Set(created.map((t) => t.id)));
  assert.equal(created[0].id, created[1].id);
  const ticket = await api(
    '/market/requests/' + created[0].id,
    customer.accessToken,
  );
  const admin = (
    await db.query('SELECT * FROM platform.admins WHERE enabled LIMIT 1')
  ).rows[0];
  const platform = jwt.sign(
    {
      sub: admin.id,
      version: admin.version,
      role: 'platform_admin',
      purpose: 'platform_access',
    },
    { expiresIn: '1h' },
  );
  const network = JSON.parse(
    await fs.readFile(
      path.join(root, '.local-preview/service-network-demo.json'),
      'utf8',
    ),
  );
  const vendor = network.companies[1],
    vendorToken = await company(vendor.id);
  const engineer = await api('/identity/login', null, {
    phone: vendor.staff[0][1],
    code: '000000',
    role: 'engineer',
  });
  async function act(actor, action, extra = {}) {
    const r = await api('/market/requests/' + ticket.id, platform);
    return api('/market/requests/' + ticket.id + '/action', actor, {
      action,
      version: r.version,
      ...extra,
    });
  }
  if (['ACCEPTED', 'PENDING'].includes(ticket.delegation_state))
    await act(platform, 'delegate-withdraw', {
      note: '测试平台重新安排告警服务',
    });
  await act(platform, 'delegate', {
    providerId: vendor.id,
    note: '测试告警服务委托给区域承接企业',
  });
  await act(vendorToken, 'delegate-accept', { note: '承接企业确认告警服务' });
  await act(vendorToken, 'assign', { engineerId: engineer.user.id });
  assert(
    (await api('/iot/devices', engineer.accessToken)).devices.some(
      (d) => d.id === id,
    ),
  );
  for (const [actor, action, extra] of [
    [engineer.accessToken, 'accept', {}],
    [
      engineer.accessToken,
      'quote',
      { amount: 120, note: '模拟告警检测及维修报价' },
    ],
    [customer.accessToken, 'approve', {}],
    [engineer.accessToken, 'start', {}],
    [
      engineer.accessToken,
      'complete',
      { report: '模拟维修完成，设备数据已恢复正常' },
    ],
    [customer.accessToken, 'confirm', {}],
  ])
    await act(actor, action, extra);
  assert.equal(
    (await api('/market/requests/' + ticket.id, customer.accessToken)).status,
    'COMPLETED',
  );
  await api('/iot/devices/' + id, engineer.accessToken, undefined, 404);
  console.log(
    'PASS IoT alarm → platform delegation → company acceptance/assignment → quote → service → customer acceptance; task completion revokes engineer telemetry access',
  );
  const serialized = JSON.stringify(ticket);
  assert(!serialized.includes('engineeringSnapshot'));
  assert(!serialized.includes('"vibration":'));
  await api(
    '/iot/ingest',
    null,
    {
      sampleId: randomUUID(),
      recordedAt: new Date(Date.now() + 1).toISOString(),
      values: { temperature: 25 },
    },
    200,
    key,
  );
  assert(
    (await api('/iot/alarms', token)).find((a) => a.id === alarm.id)
      .recoveredAt,
  );
  const rotated = await api('/iot/devices/' + id + '/credential', token, {});
  await api(
    '/iot/ingest',
    null,
    { ...sample, sampleId: randomUUID() },
    401,
    key,
  );
  await api(
    '/iot/ingest',
    null,
    { ...sample, sampleId: randomUUID() },
    200,
    rotated.deviceKey,
  );
  console.log(
    'PASS concurrent alarm conversion creates one service order, customer snapshot filtering, recovery and key rotation',
  );
  await api('/iot/devices/' + id + '/config', token, {
    metrics: metrics.map((m) => ({
      ...m,
      max: m.key === 'temperature' ? 75 : m.max,
    })),
    longitude: 114,
    latitude: 22,
  });
  assert(
    !(await api('/iot/alarms', token)).some(
      (a) => a.deviceId === id && !a.recoveredAt,
    ),
  );
  await api('/iot/devices/' + id + '/config', token, {
    offlineAfterSeconds: 10,
  });
  assert.equal((await api('/iot/devices/' + id, token)).longitude, 114);
  await iot.query(
    "UPDATE iot.devices SET last_received_at=now()-interval '1 minute' WHERE asset_id=$1",
    [id],
  );
  assert.equal(
    (await api('/iot/devices/' + id, token)).connectivity,
    'OFFLINE',
  );
  await api(
    '/iot/ingest',
    null,
    {
      sampleId: randomUUID(),
      recordedAt: new Date(Date.now() + 10).toISOString(),
      values: { temperature: 25 },
    },
    200,
    rotated.deviceKey,
  );
  assert.equal((await api('/iot/devices/' + id, token)).connectivity, 'ONLINE');
  await api('/iot/devices/' + id + '/config', token, { enabled: false });
  await api(
    '/iot/ingest',
    null,
    { ...sample, sampleId: randomUUID() },
    401,
    rotated.deviceKey,
  );
  assert.equal(
    (await api('/iot/devices/' + id, token)).connectivity,
    'DISABLED',
  );
  await api('/iot/devices/' + id + '/config', token, { enabled: true });
  await iot.query(
    'UPDATE iot.subscriptions SET enabled=false WHERE tenant_id=$1',
    [owner.id],
  );
  await api('/iot/devices', token, undefined, 403);
  await api(
    '/iot/ingest',
    null,
    { ...sample, sampleId: randomUUID() },
    403,
    rotated.deviceKey,
  );
  await iot.query(
    "UPDATE iot.subscriptions SET enabled=true,expires_at=now()-interval '1 second' WHERE tenant_id=$1",
    [owner.id],
  );
  await api('/iot/devices', token, undefined, 403);
  assert((await api('/iot/context', token)).workspaces[0].subscription.expired);
  await iot.query(
    'UPDATE iot.subscriptions SET expires_at=NULL,device_limit=1 WHERE tenant_id=$1',
    [owner.id],
  );
  const extra = await api('/admin/devices', token, {
    customerId: localCustomer.id,
    serialNumber: 'IOT-QUOTA-' + randomUUID(),
    model: '额度验证',
    deviceType: '激光焊接机',
  });
  const extraLabel = await api(
    '/admin/devices/' + extra.id + '/claim-link',
    token,
  );
  fixtures.push({
    tenant: owner.id,
    localId: extra.id,
    assetId: extraLabel.assetKey,
  });
  await api(
    '/iot/devices',
    token,
    { assetId: extraLabel.assetKey, simulated: true },
    403,
  );
  await iot.query(
    'UPDATE iot.subscriptions SET device_limit=$2,retention_days=30 WHERE tenant_id=$1',
    [owner.id, savedSubscription.device_limit],
  );
  const oldId = randomUUID(),
    recentId = randomUUID();
  await iot.query(
    `INSERT INTO iot.samples(asset_id,sample_id,recorded_at,values,fingerprint) VALUES($1,$2,now()-interval '32 days','{"temperature":25}','expired-test'),($1,$3,now()-interval '2 days','{"temperature":25}','recent-test')`,
    [id, oldId, recentId],
  );
  process.env.DB_DATABASE = database;
  const { IoTMaintenance } = await import('../dist/iot/maintenance.js');
  const { iotStore } = await import('../dist/iot/store.js');
  try {
    await new IoTMaintenance().clean();
  } finally {
    await iotStore.end();
  }
  assert.equal(
    (await iot.query('SELECT 1 FROM iot.samples WHERE sample_id=$1', [oldId]))
      .rowCount,
    0,
  );
  assert.equal(
    (
      await iot.query('SELECT 1 FROM iot.samples WHERE sample_id=$1', [
        recentId,
      ])
    ).rowCount,
    1,
  );
  assert(
    (
      await iot.query('SELECT ticket_id FROM iot.alarms WHERE id=$1', [
        alarm.id,
      ])
    ).rows[0].ticket_id,
  );
  await iot.query(
    "INSERT INTO iot.alarms(id,asset_id,tenant_id,metric,label,value,threshold,snapshot,recovered_at) SELECT gen_random_uuid(),$1,$2,'temperature','分页验证',25,'测试阈值','{}',now() FROM generate_series(1,330)",
    [id, owner.id],
  );
  const alarmTotal = Number(
    (await iot.query('SELECT count(*) FROM iot.alarms WHERE asset_id=$1', [id]))
      .rows[0].count,
  );
  const tail = await api(
    '/iot/alarms?page=' +
      Math.ceil(alarmTotal / 24) +
      '&pageSize=24&deviceId=' +
      id,
    token,
  );
  assert.equal(tail.total, alarmTotal);
  assert(tail.total > 300 && tail.alarms.length > 0);
  console.log(
    'PASS alarm pagination includes records beyond the previous 300-row cutoff',
  );
  const before = (await api('/iot/overview', token)).connectedCount;
  bulkIds.push(
    ...(
      await iot.query(
        "INSERT INTO iot.devices(asset_id,tenant_id,model,serial,metrics,credential_hash,simulated,province) SELECT gen_random_uuid(),$1,'批量统计测试','IOT-BULK-'||gen_random_uuid(),$2::jsonb,gen_random_uuid()::text,true,'广东省' FROM generate_series(1,1101) RETURNING asset_id",
        [owner.id, JSON.stringify(metrics)],
      )
    ).rows.map((d) => d.asset_id),
  );
  const bulk = await api('/iot/overview', token);
  assert.equal(bulk.connectedCount, before + 1101);
  assert.equal(bulk.summary.total, before + 1101);
  const lastPage = await api('/iot/devices?page=12&pageSize=100', token);
  assert.equal(lastPage.total, before + 1101);
  assert(lastPage.devices.length > 0);
  assert((await api('/iot/devices/' + id, token)).id === id);
  assert.equal(
    (await api('/iot/devices?search=IOT-BULK-&pageSize=1', token)).total,
    1101,
  );
  await api('/iot/devices?pageSize=101', token, undefined, 400);
  await api('/iot/overview?status=INVALID', token, undefined, 400);
  console.log(
    'PASS rule changes, sparse config, offline/recovery, disabled/expired subscription, quota, physical history retention preserving ticket snapshot, 1101-device pagination and full aggregation',
  );
} finally {
  if (savedSubscription)
    await iot.query(
      'UPDATE iot.subscriptions SET enabled=$2,expires_at=$3,device_limit=$4,retention_days=$5 WHERE tenant_id=$1',
      [
        savedSubscription.tenant_id,
        savedSubscription.enabled,
        savedSubscription.expires_at,
        savedSubscription.device_limit,
        savedSubscription.retention_days,
      ],
    );
  if (bulkIds.length)
    await iot.query('DELETE FROM iot.devices WHERE asset_id=ANY($1::uuid[])', [
      bulkIds,
    ]);
  await browserContext?.close();
  await browser?.close();
  for (const id of requests) {
    await db.query('DELETE FROM market.visuals WHERE request_id=$1', [id]);
    await db.query('DELETE FROM market.events WHERE request_id=$1', [id]);
    await db.query('DELETE FROM market.requests WHERE id=$1', [id]);
  }
  for (const f of fixtures) {
    for (const table of ['samples', 'alarms', 'rule_states'])
      await iot.query('DELETE FROM iot.' + table + ' WHERE asset_id=$1', [
        f.assetId,
      ]);
    await iot.query('DELETE FROM iot.devices WHERE asset_id=$1', [f.assetId]);
    const t = (
      await db.query('SELECT database_name FROM platform.tenants WHERE id=$1', [
        f.tenant,
      ])
    ).rows[0];
    const local = new pg.Client({ ...connection, database: t.database_name });
    try {
      await local.connect();
      await local.query('DELETE FROM devices WHERE id=$1', [f.localId]);
    } finally {
      await local.end();
    }
    await db.query('DELETE FROM identity.assets WHERE id=$1', [f.assetId]);
    await db.query(
      'DELETE FROM identity.resources WHERE tenant_id=$1 AND local_id=$2',
      [f.tenant, f.localId],
    );
  }
  if (memberPerson) {
    await iot.query('DELETE FROM iot.members WHERE person_id=$1', [
      memberPerson,
    ]);
    await db.query('DELETE FROM identity.people WHERE id=$1', [memberPerson]);
  }
  await iot.end();
  await db.end();
  console.log('CLEANUP temporary monitoring fixtures removed');
}
