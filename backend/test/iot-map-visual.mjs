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
  await page.goto('http://localhost:3103/iot.html');
  await page.locator('.iot-map-land .iot-province').last().waitFor();
  assert((await page.locator('.iot-map-land .iot-province').count()) > 30);
  await page.waitForFunction(() =>
    document.querySelector('.iot-sync')?.textContent.includes('实时连接'),
  );
  await page
    .locator('.iot-map-studio')
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  await page.locator('.iot-map-studio').screenshot({
    path: path.join(root, '.local-preview/map-effects-preview.png'),
  });
  await page.locator('.iot-node-core').first().hover();
  await page.locator('.iot-map-tooltip:not([hidden])').waitFor();
  assert(
    (await page.locator('.iot-map-tooltip').innerText()).includes('台设备'),
  );
  await page.getByRole('button', { name: '动效 开', exact: true }).click();
  assert.equal(
    await page.locator('.iot-map-studio').getAttribute('class'),
    'iot-map iot-map-studio effects-off',
  );
  assert.equal(
    await page
      .locator('.iot-scan-light')
      .evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await page.getByRole('button', { name: '动效 关', exact: true }).click();
  await page.waitForTimeout(1600);
  const animationBefore = await page
    .locator('.iot-scan-light')
    .evaluate((el) => el.getAnimations()[0].currentTime);
  await page.evaluate(
    () =>
      (document.querySelector('.iot-map-studio').dataset.testPreserved = 'yes'),
  );
  await page.getByRole('button', { name: '刷新', exact: true }).first().click();
  await page.waitForTimeout(700);
  assert.equal(
    await page.locator('.iot-map-studio').getAttribute('data-test-preserved'),
    'yes',
  );
  assert(
    (await page
      .locator('.iot-scan-light')
      .evaluate((el) => el.getAnimations()[0].currentTime)) > animationBefore,
    'Refresh must preserve the running animation timeline',
  );
  const target = page.locator('.iot-map-land [data-province="广东省"]');
  await target.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('#iot-province').value === '广东省',
  );
  await page.waitForFunction(
    () => document.querySelector('.iot-stats .stat-0')?.textContent === '6',
  );
  await page.getByLabel('设备所在省份').selectOption('');
  await page.waitForFunction(
    () => document.querySelector('.iot-stats .stat-0')?.textContent === '24',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.iot-scan-light'))
        .animationName === 'none',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    !(await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() =>
    document
      .querySelector('.iot-map-studio')
      .classList.contains('is-offscreen'),
  );
  assert.equal(
    await page
      .locator('.iot-scan-light')
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    'paused',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS map layers, tooltip, effects toggle, refresh preserves map, keyboard province filtering, reduced motion and narrow layout',
  );
} finally {
  await context?.close();
  await browser?.close();
  await db.end();
}
