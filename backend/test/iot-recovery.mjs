import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
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
const db = new pg.Client({ ...connection, database }),
  iot = new pg.Client({
    ...connection,
    database: process.env.IOT_DATABASE || database + '_iot',
  });
await db.connect();
await iot.connect();
let server, gateway, browser, context, fixture;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function listening(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}
async function ready(port) {
  for (let n = 0; n < 100; n++) {
    if (await listening(port)) return;
    await delay(100);
  }
  throw Error('Recovery test process failed to start on ' + port);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await ended;
}
function startServer() {
  return spawn(process.execPath, ['dist/main.js'], {
    cwd: path.join(root, 'backend'),
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '8382',
      DB_DATABASE: database,
    },
    stdio: 'ignore',
  });
}
async function api(route, token, body) {
  const r = await fetch('http://localhost:8180' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  assert(r.ok, route + ' ' + r.status);
  return v;
}
try {
  assert(
    !(await listening(8382)),
    'Recovery test port 8382 is already occupied',
  );
  assert(
    !(await listening(8383)),
    'Recovery test port 8383 is already occupied',
  );
  const seed = JSON.parse(
      await fs.readFile(
        path.join(root, '.local-preview/iot-devices.json'),
        'utf8',
      ),
    ),
    tenant = seed.companies[1];
  const m = (
    await db.query(
      "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",
      [tenant.id],
    )
  ).rows[0];
  const token = new JwtService({ secret: process.env.JWT_SECRET }).sign(
    {
      sub: m.subject_id,
      tenantId: tenant.id,
      membershipId: m.id,
      version: m.version,
      phone: m.phone,
      role: 'cs_operator',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
  const customer = (await api('/admin/customers', token)).find(
    (c) => c.phone === seed.customerPhone,
  );
  const d = await api('/admin/devices', token, {
    customerId: customer.id,
    serialNumber: 'IOT-RECOVERY-' + randomUUID(),
    model: '恢复验证设备',
    deviceType: '激光焊接机',
  });
  fixture = { tenant: tenant.id, localId: d.id };
  const label = await api('/admin/devices/' + d.id + '/claim-link', token);
  fixture.assetId = label.assetKey;
  const registered = await api('/iot/devices', token, {
    assetId: fixture.assetId,
    simulated: true,
  });
  server = startServer();
  await ready(8382);
  gateway = spawn(process.execPath, ['apps/iot-ingest/http-gateway.mjs'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      IOT_API_BASE: 'http://127.0.0.1:8382',
      IOT_INGEST_PORT: '8383',
    },
    stdio: 'ignore',
  });
  await ready(8383);
  async function send(sample) {
    return fetch('http://127.0.0.1:8383/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': registered.deviceKey,
      },
      body: JSON.stringify(sample),
    });
  }
  const sample = {
    sampleId: randomUUID(),
    recordedAt: new Date().toISOString(),
    values: { temperature: 30, current: 18, runtime: 12, vibration: 1 },
  };
  assert((await send(sample)).ok);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9324');
  context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:3101/login.html');
  await page.addScriptTag({
    url: 'http://127.0.0.1:8382/socket.io/socket.io.js',
  });
  await page.evaluate(
    ({ token, id }) => {
      window.iotConnections = 0;
      window.iotSnapshots = [];
      const s = window.io('http://127.0.0.1:8382/iot', {
        auth: { token },
        reconnectionDelay: 200,
        reconnectionDelayMax: 500,
      });
      window.recoverySocket = s;
      s.on('connect', () => {
        window.iotConnections++;
        s.emit('watch', { query: { search: 'IOT-RECOVERY-' } });
      });
      s.on('snapshot', (v) => {
        window.iotSnapshots = v.devices;
      });
      window.testAsset = id;
    },
    { token, id: fixture.assetId },
  );
  await page.waitForFunction(() =>
    window.iotSnapshots.some(
      (d) => d.id === window.testAsset && d.latest.temperature === 30,
    ),
  );
  await stop(server);
  server = null;
  const pending = {
    ...sample,
    sampleId: randomUUID(),
    recordedAt: new Date().toISOString(),
    values: { ...sample.values, temperature: 31 },
  };
  assert.equal((await send(pending)).status, 503);
  server = startServer();
  await ready(8382);
  await page.waitForFunction(
    () => window.iotConnections >= 2,
    {},
    { timeout: 15000 },
  );
  assert((await send(pending)).ok);
  assert((await (await send(pending)).json()).duplicate);
  await page.waitForFunction(
    () =>
      window.iotSnapshots.some(
        (d) => d.id === window.testAsset && d.latest.temperature === 31,
      ),
    {},
    { timeout: 12000 },
  );
  const durable = await fetch(
    'http://127.0.0.1:8382/iot/devices/' +
      fixture.assetId +
      '/history?hours=1&metric=temperature',
    { headers: { Authorization: 'Bearer ' + token } },
  ).then((r) => r.json());
  assert(durable.points.length > 0);
  assert.equal(
    Number(
      (
        await iot.query('SELECT count(*) FROM iot.samples WHERE asset_id=$1', [
          fixture.assetId,
        ])
      ).rows[0].count,
    ),
    2,
  );
  await iot.query(
    "UPDATE iot.devices SET last_received_at=now()-interval '2 minutes' WHERE asset_id=$1",
    [fixture.assetId],
  );
  await page.waitForFunction(
    () =>
      window.iotSnapshots.some(
        (d) => d.id === window.testAsset && d.connectivity === 'OFFLINE',
      ),
    {},
    { timeout: 12000 },
  );
  await send({
    ...pending,
    sampleId: randomUUID(),
    recordedAt: new Date().toISOString(),
  });
  await page.waitForFunction(
    () =>
      window.iotSnapshots.some(
        (d) => d.id === window.testAsset && d.connectivity === 'ONLINE',
      ),
    {},
    { timeout: 12000 },
  );
  console.log(
    'PASS isolated backend restart preserves samples; gateway reports outage; same-message retry deduplicates; realtime reconnects; heartbeat offline → online recovers',
  );
} finally {
  await context?.close();
  await browser?.close();
  await stop(gateway);
  await stop(server);
  if (fixture) {
    if (fixture.assetId) {
      for (const table of ['samples', 'alarms', 'rule_states'])
        await iot.query('DELETE FROM iot.' + table + ' WHERE asset_id=$1', [
          fixture.assetId,
        ]);
      await iot.query('DELETE FROM iot.devices WHERE asset_id=$1', [
        fixture.assetId,
      ]);
      await db.query('DELETE FROM identity.assets WHERE id=$1', [
        fixture.assetId,
      ]);
    }
    const t = (
      await db.query('SELECT database_name FROM platform.tenants WHERE id=$1', [
        fixture.tenant,
      ])
    ).rows[0];
    const local = new pg.Client({ ...connection, database: t.database_name });
    try {
      await local.connect();
      await local.query('DELETE FROM devices WHERE id=$1', [fixture.localId]);
    } finally {
      await local.end();
    }
    await db.query(
      'DELETE FROM identity.resources WHERE tenant_id=$1 AND local_id=$2',
      [fixture.tenant, fixture.localId],
    );
  }
  await iot.end();
  await db.end();
}
