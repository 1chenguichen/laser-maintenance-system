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
  await page.setViewportSize({ width: 2400, height: 1250 });
  await page.addInitScript(() => {
    window.perfLong = [];
    new PerformanceObserver((l) =>
      window.perfLong.push(
        ...l
          .getEntries()
          .map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    ).observe({ type: 'longtask', buffered: true });
  });
  const cpu = process.argv.includes('--cpu4') ? 4 : 1;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const start = Date.now();
  await page.goto('http://localhost:3103/iot.html');
  await page.locator('.iot-company-row').first().waitFor({ timeout: 30000 });
  console.log('readyMs', Date.now() - start);
  const metrics = await page.evaluate(async () => {
    const frames = [];
    let prior = performance.now();
    await new Promise((done) => {
      const end = prior + 6500;
      function frame(t) {
        frames.push(t - prior);
        prior = t;
        if (t < end) requestAnimationFrame(frame);
        else done();
      }
      requestAnimationFrame(frame);
    });
    frames.sort((a, b) => a - b);
    return {
      frames: frames.length,
      p95: frames[Math.floor(frames.length * 0.95)],
      p99: frames[Math.floor(frames.length * 0.99)],
      longTasks: window.perfLong,
      dom: document.querySelectorAll('*').length,
      resources: performance
        .getEntriesByType('resource')
        .filter((r) => r.name.includes('/iot/'))
        .map((r) => ({
          name: new URL(r.name).pathname,
          duration: Math.round(r.duration),
          bytes: r.transferSize,
        })),
    };
  });
  const scroll = await page.evaluate(async () => {
    window.perfLong = [];
    const gaps = [];
    let previous = performance.now();
    const start = previous;
    await new Promise((done) => {
      function frame(t) {
        gaps.push(t - previous);
        previous = t;
        const p = (t - start) / 3000;
        scrollTo(
          0,
          (document.documentElement.scrollHeight - innerHeight) *
            Math.sin(Math.min(p, 1) * Math.PI),
        );
        if (p < 1) requestAnimationFrame(frame);
        else done();
      }
      requestAnimationFrame(frame);
    });
    gaps.sort((a, b) => a - b);
    return {
      frames: gaps.length,
      p95: gaps[Math.floor(gaps.length * 0.95)],
      longTasks: window.perfLong,
    };
  });
  const report = {
    cpuThrottle: cpu,
    viewport: { width: 2400, height: 1250 },
    ...metrics,
    scroll,
  };
  await fs.writeFile(
    path.join(root, '.local-preview/iot-performance-' + cpu + 'x.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await context?.close();
  await browser?.close();
  await db.end();
}
