import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { JwtService } from '@nestjs/jwt';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
const db = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: (
    await fs.readFile(path.join(root, '.local-preview/database.txt'), 'utf8')
  ).trim(),
});
await db.connect();
const jwt = new JwtService({ secret: process.env.JWT_SECRET }),
  seed = JSON.parse(
    await fs.readFile(
      path.join(root, '.local-preview/iot-devices.json'),
      'utf8',
    ),
  );
let browser, context, iot, savedSubscription, newPhone, deviceFixture;
const extras = [],
  pageDeviceIds = [];
try {
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
  const tenant = seed.companies[1],
    m = (
      await db.query(
        "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",
        [tenant.id],
      )
    ).rows[0],
    company = jwt.sign(
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
  async function login(phone, role = 'customer') {
    return fetch('http://localhost:8180/identity/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role, code: '000000' }),
    }).then((r) => r.json());
  }
  const customer = await login(seed.customerPhone),
    employee = await login(seed.businessPhone),
    engineer = await login('13690000101', 'engineer');
  browser = await chromium.connectOverCDP('http://127.0.0.1:9324');
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    (t) => {
      if (location.port === '3103')
        sessionStorage.setItem('platform_admin_token', t.platform);
      if (location.port === '3100')
        sessionStorage.setItem('cs_admin_token', t.company);
      if (location.port === '3101') {
        localStorage.setItem('customer_token', t.customer.accessToken);
        localStorage.setItem('customer_user', JSON.stringify(t.customer.user));
      }
      if (location.port === '3102') {
        localStorage.setItem('engineer_token', t.engineer.accessToken);
        localStorage.setItem('engineer_user', JSON.stringify(t.engineer.user));
      }
    },
    { platform, company, customer, engineer },
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

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
  iot = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database:
      process.env.IOT_DATABASE ||
      (
        await fs.readFile(
          path.join(root, '.local-preview/database.txt'),
          'utf8',
        )
      ).trim() + '_iot',
  });
  await iot.connect();
  savedSubscription = (
    await iot.query('SELECT * FROM iot.subscriptions WHERE tenant_id=$1', [
      tenant.id,
    ])
  ).rows[0];
  const waitCards = () => page.locator('.iot-device-card').first().waitFor();
  await page.goto('http://localhost:3103/iot.html');
  await page.locator('.iot-company-row').first().waitFor();
  await page.locator('.iot-map .iot-node-core').first().waitFor();
  await page.locator('[data-tab="tenants"]').click();
  await page
    .getByRole('button', { name: '配置服务', exact: true })
    .first()
    .click();
  await page
    .locator('dialog')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await page.goto('http://localhost:3100/iot');
  await waitCards();
  await page.getByLabel('搜索监控设备').fill('not-found-' + Date.now());
  await page.getByText('暂无可查看的监测设备', { exact: true }).waitFor();
  await page.getByLabel('搜索监控设备').fill('');
  await waitCards();
  await page.getByLabel('监控设备状态').selectOption('NEVER');
  await page.locator('.iot-device-card').first().waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-device-card').length === 1,
  );
  assert.equal(await page.locator('.iot-device-card').count(), 1);
  await page.getByLabel('监控设备状态').selectOption('');
  await waitCards();
  await page.locator('.iot-device-title').first().click();
  await page.getByRole('heading', { name: '运行趋势', exact: true }).waitFor();
  await page.getByLabel('历史时间范围').selectOption('168');
  await page.getByLabel('监测指标', { exact: true }).selectOption('vibration');
  await page.getByRole('button', { name: '监控配置', exact: true }).click();
  await page.locator('dialog [name=min0]').fill('100');
  await page.locator('dialog [name=max0]').fill('1');
  await page
    .locator('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await page
    .locator('dialog .iot-form-error')
    .filter({ hasText: '下限必须小于上限' })
    .waitFor();
  await page
    .locator('dialog')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await page.getByRole('button', { name: '轮换设备凭证', exact: true }).click();
  await page
    .locator('dialog')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await page
    .getByRole('button', { name: '‹ 返回设备列表', exact: true })
    .click();
  await waitCards();
  await page.locator('[data-tab="members"]').click();
  await page.getByRole('button', { name: '授权员工', exact: true }).click();
  newPhone = '13796' + String(Date.now()).slice(-6);
  await page.locator('dialog [name=name]').fill('浏览器验收员工');
  await page.locator('dialog [name=phone]').fill(newPhone);
  await page.locator('dialog [name=scope]').selectOption('selected');
  await page.locator('dialog input[type=checkbox]').first().check();
  await page
    .locator('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  const memberRow = page.locator('tr').filter({ hasText: newPhone });
  await memberRow
    .getByRole('button', { name: '停用授权', exact: true })
    .click();
  await memberRow
    .getByRole('button', { name: '恢复授权', exact: true })
    .click();
  await memberRow
    .getByRole('button', { name: '停用授权', exact: true })
    .waitFor();
  assert.equal(
    (await api('/iot/members', company)).find(
      (m) => m.person.phone === newPhone,
    ).asset_ids.length,
    1,
  );
  await page.locator('[data-tab="devices"]').click();
  await waitCards();
  await context.setOffline(true);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.locator('.iot-notice:not([hidden])').waitFor();
  await context.setOffline(false);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await waitCards();
  const customerRecord = (await api('/admin/customers', company)).find(
    (c) => c.phone === seed.customerPhone,
  );
  const serial = 'IOT-UI-' + randomUUID();
  const newDevice = await api('/admin/devices', company, {
    customerId: customerRecord.id,
    serialNumber: serial,
    model: '界面验收设备',
    deviceType: '激光焊接机',
  });
  deviceFixture = { localId: newDevice.id, tenant: tenant.id };
  const label = await api(
    '/admin/devices/' + newDevice.id + '/claim-link',
    company,
  );
  deviceFixture.assetId = label.assetKey;
  await page.getByRole('button', { name: '接入现有设备', exact: true }).click();
  await page.locator('dialog [name=assetSearch]').fill(serial);
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        'dialog [name=assetId] option[value="' + id + '"]',
      ),
    label.assetKey,
  );
  await page.locator('dialog [name=assetId]').selectOption(label.assetKey);
  await page.locator('dialog [name=province]').fill('广东省');
  await page.locator('dialog [name=city]').fill('深圳市');
  await page.locator('dialog [name=address]').fill('界面验收模拟地址');
  await page
    .locator('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  const keyField = page.getByLabel('设备接入凭证', { exact: true });
  await keyField.waitFor();
  const deviceKey = await keyField.inputValue();
  assert(deviceKey.length > 32);
  await page
    .locator('dialog')
    .getByRole('button', { name: '完成', exact: true })
    .click();
  await page.getByLabel('搜索监控设备').fill(serial);
  await page
    .locator('.iot-device-title')
    .filter({ hasText: '界面验收设备' })
    .click();
  await page.getByRole('button', { name: '监控配置', exact: true }).click();
  await page.locator('dialog [name=duration0]').fill('0');
  await page
    .locator('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  const upload = await fetch('http://localhost:8180/iot/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Key': deviceKey },
    body: JSON.stringify({
      sampleId: randomUUID(),
      recordedAt: new Date().toISOString(),
      values: { temperature: 60, current: 18, runtime: 1, vibration: 2 },
    }),
  });
  assert(upload.ok);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  const alarmRow = page.locator('tr').filter({ hasText: serial });
  await alarmRow.getByRole('button', { name: '记录处理', exact: true }).click();
  await page.locator('dialog [name=note]').fill('已核实，准备安排工程师检测');
  await page
    .locator('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await alarmRow.getByText('已确认', { exact: true }).waitFor();
  await alarmRow
    .getByRole('button', { name: '生成平台服务单', exact: true })
    .click();
  await page.locator('dialog [name=note]').fill('模拟告警需要安排上门检测');
  await page
    .locator('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await alarmRow.locator('.iot-ticket').waitFor();
  assert(
    (
      await iot.query('SELECT ticket_id FROM iot.alarms WHERE asset_id=$1', [
        label.assetKey,
      ])
    ).rows[0].ticket_id,
  );
  console.log(
    'PASS real browser device enrollment with serial search, one-time credential, rule save, alarm acknowledgement and service-order conversion',
  );
  await iot.query(
    "INSERT INTO iot.alarms(id,asset_id,tenant_id,metric,label,value,threshold,snapshot,recovered_at) SELECT gen_random_uuid(),$1,$2,'temperature','界面分页验证',25,'测试阈值','{}',now() FROM generate_series(1,30)",
    [label.assetKey, tenant.id],
  );
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page
    .locator('[data-action=alarm-page]')
    .filter({ hasText: '下一页' })
    .click();
  await page.waitForFunction(() =>
    document.querySelector('.iot-pagination')?.textContent.includes('第 2 /'),
  );
  assert((await page.locator('.iot-pagination').innerText()).includes('31'));

  await page
    .getByRole('button', { name: '‹ 返回设备列表', exact: true })
    .click();
  await page.getByLabel('搜索监控设备').fill('');
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-device-card').length >= 8,
  );
  pageDeviceIds.push(
    ...(
      await iot.query(
        "INSERT INTO iot.devices(asset_id,tenant_id,model,serial,metrics,credential_hash,simulated) SELECT gen_random_uuid(),$1,'界面设备分页','IOT-PAGE-'||gen_random_uuid(),'[]',gen_random_uuid()::text,true FROM generate_series(1,25) RETURNING asset_id",
        [tenant.id],
      )
    ).rows.map((d) => d.asset_id),
  );
  await page.getByLabel('搜索监控设备').fill('IOT-PAGE-');
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-device-card').length === 24,
  );
  await page
    .locator('[data-action=device-page]')
    .filter({ hasText: '下一页' })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-device-card').length === 1,
  );
  await page
    .locator('[data-action=device-page]')
    .filter({ hasText: '上一页' })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-device-card').length === 24,
  );
  await iot.query('DELETE FROM iot.devices WHERE asset_id=ANY($1::uuid[])', [
    pageDeviceIds,
  ]);
  pageDeviceIds.length = 0;
  await page.getByLabel('搜索监控设备').fill('');
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-device-card').length === 9,
  );
  console.log('PASS actual device and alarm next/previous page controls');
  await page.screenshot({
    path: path.join(root, '.local-preview/iot-acceptance-company.png'),
  });
  console.log(
    'PASS platform subscription dialog; enterprise search/status, history controls, invalid-rule validation, cancel, member grant/disable/restore preserving device scope, network recovery',
  );

  // A real form login, with no init script that could silently refill the token after logout.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  extras.push(mobile);
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await mp.goto('http://localhost:3101/login.html');
  await mp.locator('#phone').fill(seed.businessPhone);
  await mp.locator('#smsCode').fill('000000');
  await mp.locator('#loginBtn').click();
  await mp.waitForURL('**/business/choose.html');
  const workspace = mp
    .locator('.identity-option')
    .filter({ hasText: tenant.name });
  await workspace.click();
  await mp.locator('.iot-device-card').first().waitFor();
  assert.equal(await mp.locator('#company-name').innerText(), tenant.name);
  assert.equal(await mp.locator('[data-tab=members]').count(), 0);
  await mp.reload();
  await mp.locator('.iot-device-card').first().waitFor();
  await mp.getByRole('link', { name: '切换企业', exact: true }).click();
  await mp
    .locator('.identity-option')
    .filter({ hasText: seed.companies[2].name })
    .click();
  await mp.locator('.iot-device-card').first().waitFor();
  assert.equal(
    await mp.locator('#company-name').innerText(),
    seed.companies[2].name,
  );
  await mp.getByRole('link', { name: '切换企业', exact: true }).click();
  await mp.locator('.identity-option').filter({ hasText: tenant.name }).click();
  await mp.locator('.iot-device-card').first().waitFor();
  await mp.screenshot({
    path: path.join(root, '.local-preview/iot-acceptance-mobile.png'),
  });
  await mp.setViewportSize({ width: 320, height: 740 });
  assert(
    !(await mp.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  await mp.getByRole('button', { name: '退出登录', exact: true }).click();
  await mp.waitForURL('**/login.html');
  assert.equal(
    await mp.evaluate(() => localStorage.getItem('customer_token')),
    null,
  );
  await mp.goto(
    'http://localhost:3101/business/index.html?workspace=' + tenant.id,
  );
  await mp.waitForURL('**/login.html');

  // Use the existing platform-issued credential in memory only; do not log passwords.
  const account = await api('/platform/tenants/' + tenant.id, platform);
  assert(
    account.issuedPassword,
    'Platform-issued password is required for corporate login acceptance',
  );
  await mp.goto('http://localhost:3101/login.html?method=password');
  await mp.locator('[name=username]').fill(account.adminAccount);
  await mp.locator('[name=password]').fill('invalid-password');
  await mp.getByRole('button', { name: '登录', exact: true }).click();
  await mp
    .locator('#organizationError')
    .filter({ hasText: '不正确' })
    .waitFor();
  await mp.locator('[name=password]').fill(account.issuedPassword);
  await mp.getByRole('button', { name: '登录', exact: true }).click();
  await mp.locator('.iot-device-card').first().waitFor();
  assert.equal(await mp.locator('#company-name').innerText(), tenant.name);
  await iot.query(
    'UPDATE iot.subscriptions SET enabled=false WHERE tenant_id=$1',
    [tenant.id],
  );
  await mp.reload();
  await mp
    .getByText('本企业尚未开通物联网，请联系平台开通后使用。', { exact: true })
    .waitFor();
  await iot.query(
    "UPDATE iot.subscriptions SET enabled=true,expires_at=now()-interval '1 second' WHERE tenant_id=$1",
    [tenant.id],
  );
  await mp.reload();
  await mp
    .getByText('本企业物联网服务已到期，请联系平台续期开通。', { exact: true })
    .waitFor();
  await iot.query(
    'UPDATE iot.subscriptions SET enabled=$2,expires_at=$3 WHERE tenant_id=$1',
    [tenant.id, savedSubscription.enabled, savedSubscription.expires_at],
  );
  await mp.reload();
  await mp.locator('.iot-device-card').first().waitFor();
  await mp.getByRole('button', { name: '退出登录', exact: true }).click();
  await mp.waitForURL('**/login.html');
  assert.equal(
    await mp.evaluate(() => sessionStorage.getItem('iot_business_token')),
    null,
  );
  await mp.goto(
    'http://localhost:3101/business/index.html?workspace=' + randomUUID(),
  );
  await mp.waitForURL('**/login.html');
  console.log(
    'PASS real employee OTP login, enterprise identity selection/switch/reload/logout, corporate password login and invalid password, disabled/expired service guidance, 320px layout',
  );
  assert.deepEqual(errors, []);
  console.log('PASS no unhandled browser errors');
} finally {
  for (const c of extras) await c.close();
  await context?.close();
  await browser?.close();
  if (savedSubscription && iot)
    await iot.query(
      'UPDATE iot.subscriptions SET enabled=$2,expires_at=$3 WHERE tenant_id=$1',
      [
        savedSubscription.tenant_id,
        savedSubscription.enabled,
        savedSubscription.expires_at,
      ],
    );
  if (pageDeviceIds.length)
    await iot.query('DELETE FROM iot.devices WHERE asset_id=ANY($1::uuid[])', [
      pageDeviceIds,
    ]);
  if (deviceFixture) {
    if (deviceFixture.assetId) {
      const ids = (
        await iot.query(
          'SELECT ticket_id FROM iot.alarms WHERE asset_id=$1 AND ticket_id IS NOT NULL',
          [deviceFixture.assetId],
        )
      ).rows.map((r) => r.ticket_id);
      for (const id of ids) {
        await db.query('DELETE FROM market.visuals WHERE request_id=$1', [id]);
        await db.query('DELETE FROM market.events WHERE request_id=$1', [id]);
        await db.query('DELETE FROM market.requests WHERE id=$1', [id]);
      }
      for (const table of ['samples', 'alarms', 'rule_states'])
        await iot.query('DELETE FROM iot.' + table + ' WHERE asset_id=$1', [
          deviceFixture.assetId,
        ]);
      await iot.query('DELETE FROM iot.devices WHERE asset_id=$1', [
        deviceFixture.assetId,
      ]);
      await db.query('DELETE FROM identity.assets WHERE id=$1', [
        deviceFixture.assetId,
      ]);
    }
    const tenant = (
      await db.query('SELECT database_name FROM platform.tenants WHERE id=$1', [
        deviceFixture.tenant,
      ])
    ).rows[0];
    const local = new pg.Client({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: tenant.database_name,
    });
    try {
      await local.connect();
      await local.query('DELETE FROM devices WHERE id=$1', [
        deviceFixture.localId,
      ]);
    } finally {
      await local.end();
    }
    await db.query(
      'DELETE FROM identity.resources WHERE tenant_id=$1 AND local_id=$2',
      [deviceFixture.tenant, deviceFixture.localId],
    );
  }
  if (newPhone) {
    const p = (
      await db.query('SELECT id FROM identity.people WHERE phone=$1', [
        newPhone,
      ])
    ).rows[0];
    if (p) {
      await iot.query('DELETE FROM iot.members WHERE person_id=$1', [p.id]);
      await db.query('DELETE FROM identity.people WHERE id=$1', [p.id]);
    }
  }
  await iot?.end();
  await db.end();
}
