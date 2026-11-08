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
const phones = [];
const extraContexts = [];
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
  async function api(route, token, body, status = 200) {
    const r = await fetch('http://localhost:8180' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + (token || ''),
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const v = await r.json();
    if (status < 400) assert(r.ok, route + ' ' + r.status);
    else assert.equal(r.status, status, route);
    return v;
  }
  const suffix = String(Date.now()).slice(-6),
    normalPhone = '13793' + suffix,
    staffPhone = '13794' + suffix;
  phones.push(normalPhone, staffPhone);
  const normal = await api('/iot/mobile-login', null, {
    phone: normalPhone,
    code: '000000',
    mode: 'code',
    role: 'platform',
    workspace: tenant.id,
  });
  assert.equal(normal.mobile.type, 'customer');
  assert.equal(normal.mobile.next, 'home.html');
  assert.equal(normal.mobile.workspaces.length, 0);
  for (const route of [
    '/iot/devices',
    '/iot/overview',
    '/iot/alarms',
    '/iot/devices?workspace=' + tenant.id,
  ])
    await api(route, normal.accessToken, undefined, 403);
  const ownDevice = seed.devices.find((d) => d.tenantId === tenant.id);
  await api('/iot/members', company, {
    phone: staffPhone,
    name: '移动身份验收员工',
    role: 'viewer',
    enabled: true,
    assetIds: [ownDevice.assetId],
  });
  const single = await api('/iot/mobile-login', null, {
    phone: staffPhone,
    code: '000000',
  });
  assert.equal(single.mobile.type, 'enterprise');
  assert(
    single.mobile.next.startsWith('business/index.html?workspace=' + tenant.id),
  );
  assert.equal(single.mobile.workspaces.length, 1);
  assert.equal(
    (await api('/iot/devices?workspace=' + tenant.id, single.accessToken))
      .devices.length,
    1,
  );
  await api(
    '/iot/devices?workspace=' + seed.companies[2].id,
    single.accessToken,
    undefined,
    403,
  );
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  extraContexts.push(mobile);
  const p = await mobile.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  async function codeLogin(phone) {
    await p.goto('http://localhost:3101/login.html');
    await p.locator('#phone').fill(phone);
    await p.locator('#smsCode').fill('000000');
    await p.locator('#loginBtn').click();
  }
  await p.goto('http://localhost:3101/login.html');
  assert.equal(await p.locator('a[href*="business/"]').count(), 0);
  await codeLogin(normalPhone);
  await p.waitForURL('**/home.html');
  assert.equal(
    await p.locator('a[href*="iot/"],a[href*="business/"]').count(),
    0,
  );
  await p.goto('http://localhost:3101/profile.html');
  await p.waitForTimeout(300);
  assert.equal(
    await p.locator('a[href*="iot/"],a[href*="business/"]').count(),
    0,
  );
  await p.goto('http://localhost:3101/business/choose.html');
  await p.waitForURL('**/home.html');
  await p.goto('http://localhost:3101/iot/monitor.html');
  await p.waitForURL('**/home.html');
  await codeLogin(staffPhone);
  await p.waitForURL('**/business/index.html?*');
  await p.locator('.iot-device-card').waitFor();
  assert.equal(await p.locator('#company-name').innerText(), tenant.name);
  assert(await p.locator('#switch-company').isHidden());
  assert.equal(await p.locator('a[href="../home.html"]').count(), 0);
  assert.equal(await p.locator('[data-tab=members]').count(), 0);
  await p.reload();
  await p.locator('.iot-device-card').waitFor();
  assert.equal(await p.locator('.iot-device-card').count(), 1);
  await p.getByRole('button', { name: '退出登录', exact: true }).click();
  await p.waitForURL('**/login.html');
  assert.equal(
    await p.evaluate(() => sessionStorage.getItem('iot_business_token')),
    null,
  );
  const foreign = seed.companies[2],
    membership = (
      await db.query(
        "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",
        [foreign.id],
      )
    ).rows[0];
  const foreignToken = jwt.sign(
    {
      sub: membership.subject_id,
      tenantId: foreign.id,
      membershipId: membership.id,
      version: membership.version,
      role: 'cs_operator',
      phone: membership.phone,
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
  await api('/iot/members', foreignToken, {
    phone: staffPhone,
    name: '移动身份验收员工',
    role: 'viewer',
    enabled: true,
    assetIds: [seed.devices.find((d) => d.tenantId === foreign.id).assetId],
  });
  await codeLogin(staffPhone);
  await p.waitForURL('**/business/choose.html');
  await p.locator('.identity-option').first().waitFor();
  assert.equal(await p.locator('.identity-option').count(), 2);
  assert.equal(await p.getByText('个人客户', { exact: true }).count(), 0);
  await p.locator('.identity-option').filter({ hasText: tenant.name }).click();
  await p.locator('.iot-device-card').waitFor();
  assert(await p.locator('#switch-company').isVisible());
  await p.getByRole('link', { name: '切换企业', exact: true }).click();
  await p.locator('.identity-option').filter({ hasText: foreign.name }).click();
  await p.locator('.iot-device-card').waitFor();
  assert.equal(await p.locator('#company-name').innerText(), foreign.name);
  // Revocation must remove access even for an already signed-in account.
  await api('/iot/members', foreignToken, {
    phone: staffPhone,
    name: '移动身份验收员工',
    role: 'viewer',
    enabled: false,
    assetIds: [seed.devices.find((d) => d.tenantId === foreign.id).assetId],
  });
  await api('/iot/members', company, {
    phone: staffPhone,
    name: '移动身份验收员工',
    role: 'viewer',
    enabled: false,
    assetIds: [ownDevice.assetId],
  });
  await p.reload();
  await p.waitForURL('**/login.html');
  const account = await api('/platform/tenants/' + tenant.id, platform);
  await p.getByRole('tab', { name: '密码登录', exact: true }).click();
  await p.locator('#username').fill(account.adminAccount);
  await p.locator('#password').fill('incorrect-password');
  await p.locator('#loginBtn').click();
  await p.locator('#organizationError').filter({ hasText: '不正确' }).waitFor();
  await p.locator('#password').fill(account.issuedPassword);
  await p.locator('#loginBtn').click();
  await p.waitForURL('**/business/index.html?*');
  await p.locator('.iot-device-card').first().waitFor();
  assert.equal(await p.locator('#company-name').innerText(), tenant.name);
  assert(await p.locator('#switch-company').isHidden());
  await p.screenshot({
    path: path.join(root, '.local-preview/mobile-company-login.png'),
  });
  assert(
    !(await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  await p.getByRole('button', { name: '退出登录', exact: true }).click();
  await p.waitForURL('**/login.html');
  await p.goto('http://localhost:3101/business/login.html');
  await p.waitForURL('**/login.html?method=password');
  assert(await p.locator('#password').isVisible());
  assert.deepEqual(errors, []);
  console.log(
    'PASS server login classification, ordinary customer isolation and no IoT links, direct single-company entry, company-only multi-selection, device-scoped staff access, cross-company denial, live revocation, shared password login, logout and legacy URL continuation',
  );
} finally {
  for (const c of extraContexts) await c.close();
  await context?.close();
  await browser?.close();
  for (const phone of phones) {
    const person = (
      await db.query('SELECT id FROM identity.people WHERE phone=$1', [phone])
    ).rows[0];
    if (person) {
      await iot.query('DELETE FROM iot.members WHERE person_id=$1', [
        person.id,
      ]);
      await db.query('DELETE FROM identity.people WHERE id=$1', [person.id]);
    }
  }
  await iot?.end();
  await db.end();
}
