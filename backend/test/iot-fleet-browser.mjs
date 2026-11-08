import 'reflect-metadata';
import assert from 'node:assert/strict';
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
let browser, context, iot;
const bulkIds = [];
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
  async function api(route, token, status = 200) {
    const r = await fetch('http://localhost:8180' + route, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const v = await r.json();
    assert.equal(r.status, status, route);
    return v;
  }
  const grouped = await api('/iot/companies?page=1&pageSize=8', platform);
  assert.equal(grouped.total, 3);
  assert.equal(
    grouped.companies.reduce((n, c) => n + c.total, 0),
    24,
  );
  const scoped = await api('/iot/devices?companyId=' + tenant.id, platform);
  assert.equal(scoped.total, 8);
  assert(scoped.devices.every((d) => d.tenantId === tenant.id));
  await api('/iot/companies', company, 403);
  const summary = await api('/iot/overview', platform);
  assert(summary.attention.length <= 6);
  await page.goto('http://localhost:3103/iot.html');
  await page.locator('.iot-company-row').first().waitFor();
  assert.equal(await page.locator('.iot-device-card').count(), 0);
  assert.equal(await page.locator('.iot-company-row').count(), 3);
  assert((await page.locator('.iot-attention-item').count()) <= 6);
  await page.waitForFunction(() =>
    document.querySelector('.iot-sync')?.textContent.includes('实时连接'),
  );
  await page.locator('.iot-platform-lower').evaluate((el) => {
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
  });
  await page
    .locator('.iot-platform-lower')
    .screenshot({ path: path.join(root, '.local-preview/fleet-summary.png') });
  await page
    .locator('.iot-company-name[data-id="' + tenant.id + '"]')
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-device-row]').length === 8,
  );
  assert(
    (await page.locator('.iot-company-filter').innerText()).includes(
      tenant.name,
    ),
  );
  await page.getByLabel('搜索监控设备').fill('IOT-DEMO-2-001');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-device-row]').length === 1,
  );
  await page.locator('[data-device-row] [data-action=device]').last().click();
  await page.locator('.iot-device-drawer[open]').waitFor();
  await page.getByRole('heading', { name: '运行趋势', exact: true }).waitFor();
  await page.getByLabel('历史时间范围').selectOption('72');
  await page
    .locator('.iot-device-drawer')
    .screenshot({ path: path.join(root, '.local-preview/fleet-drawer.png') });
  await page.keyboard.press('Escape');
  await page.locator('.iot-device-drawer').waitFor({ state: 'detached' });
  assert.equal(
    await page.getByLabel('搜索监控设备').inputValue(),
    'IOT-DEMO-2-001',
  );
  assert.equal(await page.locator('[data-device-row]').count(), 1);
  await page.route('**/iot/devices/*', async (route) => {
    await new Promise((r) => setTimeout(r, 550));
    await route.continue();
  });
  await page.locator('[data-device-row] [data-action=device]').last().click();
  await page.locator('.iot-device-drawer[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(850);
  assert.equal(
    await page.locator('.iot-device-drawer').count(),
    0,
    'Closing during loading must not reopen the drawer',
  );
  await page.unroute('**/iot/devices/*');
  await page.getByLabel('搜索监控设备').fill('');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-device-row]').length === 8,
  );
  await page.getByRole('button', { name: '清除企业筛选', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-device-row]').length === 20,
  );
  await page
    .locator('[data-action=device-page]')
    .filter({ hasText: '下一页' })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-device-row]').length === 4,
  );
  await page.locator('[data-device-row] [data-action=device]').first().click();
  await page.locator('.iot-device-drawer[open]').waitFor();
  await page.getByRole('heading', { name: '运行趋势', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭设备详情', exact: true }).click();
  assert.equal(await page.locator('[data-device-row]').count(), 4);
  assert(
    (await page.locator('.iot-pagination').innerText()).includes('第 2 / 2'),
  );
  await page.getByRole('button', { name: '返回全国总览', exact: true }).click();
  await page.locator('.iot-map-studio').waitFor();
  await page.locator('.iot-map-land [data-province="广东省"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('#iot-province').value === '广东省',
  );
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll('.iot-company-row td:nth-child(2)'),
    ).every((el) => el.textContent === '2 台'),
  );
  await page.getByLabel('设备所在省份').selectOption('');
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll('.iot-company-row td:nth-child(2)'),
    ).every((el) => el.textContent === '8 台'),
  );
  bulkIds.push(
    ...(
      await iot.query(
        "INSERT INTO iot.devices(asset_id,tenant_id,model,serial,metrics,credential_hash,simulated) SELECT gen_random_uuid(),$1,'平台规模验证','IOT-FLEET-TEST-'||gen_random_uuid(),'[]',gen_random_uuid()::text,true FROM generate_series(1,1101) RETURNING asset_id",
        [tenant.id],
      )
    ).rows.map((d) => d.asset_id),
  );
  const volume = await api('/iot/companies?companyId=' + tenant.id, platform);
  assert.equal(volume.companies[0].total, 1109);
  assert.equal(
    (await api('/iot/overview?companyId=' + tenant.id, platform)).attention
      .length,
    6,
  );
  await page.getByLabel('搜索监控设备').fill('IOT-FLEET-TEST-');
  await page.waitForFunction(
    () => document.querySelectorAll('.iot-company-row').length === 1,
  );
  assert.equal(await page.locator('.iot-device-card').count(), 0);
  assert.equal(
    await page.locator('.iot-company-row td:nth-child(2)').innerText(),
    '1101 台',
  );
  assert((await page.locator('.iot-attention-item').count()) <= 6);
  await page.getByRole('button', { name: '查看全部设备', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-device-row]').length === 20,
  );
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.iot-pagination')
      ?.textContent.includes('第 2 / 56'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS grouped company totals, bounded attention, company/region/search drilldown, 20-row pagination, detail drawer and close/Escape preserving state, 1101-device summary and paging, role boundary and narrow layout',
  );
} finally {
  await context?.close();
  await browser?.close();
  if (bulkIds.length)
    await iot.query('DELETE FROM iot.devices WHERE asset_id=ANY($1::uuid[])', [
      bulkIds,
    ]);
  await iot?.end();
  await db.end();
}
