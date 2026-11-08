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
let browser, context;
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

  const target = seed.companies[2];
  const member = (
    await db.query(
      "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' AND enabled LIMIT 1",
      [target.id],
    )
  ).rows[0];
  const tenantToken = jwt.sign(
    {
      sub: member.subject_id,
      tenantId: target.id,
      membershipId: member.id,
      version: member.version,
      phone: member.phone,
      role: 'cs_operator',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
  await context.addInitScript((token) => {
    sessionStorage.setItem('iot_business_token', token);
  }, tenantToken);
  await page.goto(
    'http://localhost:3101/business/index.html?workspace=' +
      target.id +
      '&account=business',
  );
  await page.locator('.iot-device-card').first().waitFor();
  await page.locator('.iot-analytics-card').first().waitFor();
  assert.equal(await page.locator('.iot-analytics-card').count(), 4);
  const api = 'http://localhost:8180/iot';
  const headers = { Authorization: 'Bearer ' + tenantToken };
  const analyticsResponse = await fetch(api + '/analytics', { headers });
  assert.equal(analyticsResponse.status, 200);
  const analytics = await analyticsResponse.json();
  const overview = await fetch(api + '/overview', { headers }).then((r) =>
    r.json(),
  );
  assert.equal(
    analytics.statuses.reduce((n, r) => n + r.total, 0),
    overview.summary.total,
  );
  assert.equal(
    analytics.types.reduce((n, r) => n + r.total, 0),
    overview.summary.total,
  );
  assert.equal(analytics.activity.length, 24);
  assert.equal(analytics.alarms.length, 7);
  const foreign = await fetch(
    api + '/analytics?companyId=' + seed.companies[0].id,
    { headers },
  ).then((r) => r.json());
  assert.equal(foreign.statuses.length, 0);
  const forbidden = await fetch(api + '/analytics', {
    headers: { Authorization: 'Bearer ' + customer.accessToken },
  });
  assert.equal(forbidden.status, 403);
  const filtered = await fetch(api + '/analytics?search=NOT-EXISTING-DEVICE', {
    headers,
  }).then((r) => r.json());
  assert.equal(
    filtered.activity.reduce((n, r) => n + r.total, 0),
    0,
  );
  assert.equal(
    filtered.alarms.reduce((n, r) => n + r.total, 0),
    0,
  );
  console.log(
    'PASS tenant-scoped analytics, ordinary user denied, 24/7 buckets, filters',
  );
  for (const width of [320, 390, 600, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => {
      const grid = document.querySelector('.iot-device-grid'),
        card = document.querySelector('.iot-device-card'),
        title = card.querySelector('.iot-device-title'),
        number = card.querySelector('.iot-metrics strong');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        cardWidth: card.getBoundingClientRect().width,
        titleWidth: title.getBoundingClientRect().width,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        bodyWidth: document.body.getBoundingClientRect().width,
        numberOverflow: [
          ...document.querySelectorAll('.iot-device-card .iot-metrics strong'),
        ].some((el) => el.scrollWidth > el.clientWidth + 1),
      };
    });
    assert.equal(layout.columns, 1, 'Single-column phone layout at ' + width);
    assert(!layout.overflow, 'Page overflow at ' + width);
    assert(!layout.numberOverflow, 'Metric overlap at ' + width);
    assert(
      layout.cardWidth >= 250 && layout.titleWidth >= 100,
      'Device title collapsed at ' + width,
    );
    assert(
      layout.bodyWidth <= 601,
      'Phone content stretched across desktop at ' + width,
    );
    console.log('PASS viewport', width, JSON.stringify(layout));
    if (width === 390 || width === 1440) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: path.join(
          root,
          '.local-preview/business-layout-' + width + '.png',
        ),
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.iot-device-title').last().scrollIntoViewIfNeeded();
  const listY = await page.evaluate(() => scrollY);
  await page.locator('.iot-device-title').last().click();
  await page.getByRole('heading', { name: '运行趋势', exact: true }).waitFor();
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  const back = page.locator('#business-detail-back');
  assert(await back.isVisible());
  const backRect = await back.boundingBox();
  assert(backRect.y >= 0 && backRect.y < 100);
  await back.click();
  await page.waitForTimeout(250);
  assert(
    Math.abs((await page.evaluate(() => scrollY)) - listY) < 5,
    'Restored list position',
  );
  await page.locator('.iot-device-card').first().waitFor();
  await page.locator('[data-tab=alarms]').click();
  await page.getByRole('heading', { name: '告警中心', exact: true }).waitFor();
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  const desktop = await context.newPage();
  await desktop.setViewportSize({ width: 1440, height: 1000 });
  await desktop.goto('http://localhost:3100/iot');
  await desktop.locator('.iot-analytics-card').first().waitFor();
  assert.equal(await desktop.locator('.iot-analytics-card').count(), 4);
  assert.equal(
    await desktop.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('.iot-analytics-grid'),
        ).gridTemplateColumns.split(' ').length,
    ),
    2,
  );
  assert(
    !(await desktop.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  console.log(
    'PASS desktop two-column analytics and mobile sticky back with scroll restoration',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS long company name, phone detail and alarm tab, no browser errors',
  );
} finally {
  await context?.close();
  await browser?.close();
  await db.end();
}
