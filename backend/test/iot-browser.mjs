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
  for (const [url, file] of [
    ['http://localhost:3103/iot.html', 'platform'],
    ['http://localhost:3100/iot', 'company'],
    ['http://localhost:3101/iot/monitor.html', 'customer'],
    ['http://localhost:3102/iot/monitor.html', 'engineer'],
  ]) {
    await page.goto(url);
    if (file === 'customer') {
      await page.waitForURL('**/home.html');
      assert.equal(
        await page.locator('a[href*="iot/"],a[href*="business/"]').count(),
        0,
      );
      console.log(
        'customer: personal service only; telemetry route redirects home',
      );
      continue;
    }
    await page
      .locator(file === 'platform' ? '.iot-company-row' : '.iot-device-card')
      .first()
      .waitFor({ timeout: 15000 });
    await page.waitForFunction(() =>
      document.querySelector('.iot-sync')?.textContent.includes('实时连接'),
    );
    console.log(
      file,
      await page
        .locator(file === 'platform' ? '.iot-company-row' : '.iot-device-card')
        .count(),
      file === 'platform'
        ? 'company groups; realtime connected'
        : 'cards; realtime connected',
    );
    if (file === 'platform') {
      await page.locator('.iot-map svg').waitFor();
      await page
        .locator('.iot-attention-item [data-action=device]')
        .first()
        .click();
      await page.locator('.iot-device-drawer[open]').waitFor();
      await page
        .getByRole('button', { name: '关闭设备详情', exact: true })
        .click();
      continue;
    }
    const online = page
      .locator('.iot-device-card')
      .filter({ has: page.locator('.iot-badge.online') })
      .first();
    await online.locator('.iot-device-title').click();
    await page
      .getByRole('heading', { name: '运行趋势', exact: true })
      .waitFor();
    await page.getByLabel('历史时间范围').selectOption('72');
    if (file === 'customer') {
      assert.equal(
        await page.locator('#iot-metric option[value=vibration]').count(),
        0,
      );
      assert.equal(
        await page
          .getByRole('button', { name: '监控配置', exact: true })
          .count(),
        0,
      );
      assert(
        await page
          .getByRole('link', { name: '报修这台设备', exact: true })
          .getAttribute('href'),
      );
    }
    if (file === 'engineer') {
      assert.equal(
        await page.locator('#iot-metric option[value=vibration]').count(),
        1,
      );
      await page
        .getByLabel('监测指标', { exact: true })
        .selectOption('vibration');
    }
    if (file === 'customer' || file === 'engineer') {
      await page.setViewportSize({ width: 320, height: 740 });
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )),
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    await mobile.addInitScript((t) => {
      sessionStorage.setItem('iot_business_token', t.accessToken);
      sessionStorage.setItem('iot_business_user', JSON.stringify(t.user));
    }, employee);
    const mp = await mobile.newPage();
    mp.on('pageerror', (e) => errors.push(e.message));
    await mp.goto(
      'http://localhost:3101/business/index.html?workspace=' + tenant.id,
    );
    await mp.locator('.iot-device-card').first().waitFor();
    if (
      await mp.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw Error('Mobile layout overflow');
    console.log(
      'Mobile company',
      await mp.locator('#company-name').innerText(),
    );
  } finally {
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS customer/engineer detail privacy, trend controls, 320px layout and no browser errors',
  );
} finally {
  await context?.close();
  await browser?.close();
  await db.end();
}
