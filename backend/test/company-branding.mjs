import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import sharp from 'sharp';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { chromium } from 'playwright';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
const cfg = {
    host: 'localhost',
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  db = (
    await fs.readFile(path.join(root, '.local-preview/database.txt'), 'utf8')
  ).trim(),
  control = new pg.Client({ ...cfg, database: db });
await control.connect();
const tenantId = randomUUID(),
  membershipId = randomUUID(),
  subjectId = randomUUID(),
  dbName = 'laser_brand_test_' + Date.now(),
  code = 'brand-' + Date.now(),
  jwt = new JwtService({ secret: process.env.JWT_SECRET });
let source;
const auth = jwt.sign(
  {
    sub: subjectId,
    tenantId,
    membershipId,
    version: 1,
    phone: '13898765001',
    role: 'cs_operator',
    purpose: 'access',
  },
  { expiresIn: '1h' },
);
const before = (
  await control.query(
    'SELECT id,name,company_version FROM platform.tenants ORDER BY id',
  )
).rows;
async function api(url, method = 'GET', body, token = auth) {
  const r = await fetch('http://localhost:8180' + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  return { status: r.status, data: await r.json() };
}
async function logo(bytes, version, filename = 'logo.png') {
  const body = new FormData();
  body.append('file', new Blob([bytes]), filename);
  body.append('version', String(version));
  return api('/admin/company/logo', 'POST', body);
}
try {
  await control.query('CREATE DATABASE "' + dbName + '"');
  source = new DataSource({
    type: 'postgres',
    ...cfg,
    username: cfg.user,
    database: dbName,
    entities: [path.join(root, 'backend/dist/database/entities/*.entity.js')],
    synchronize: true,
  });
  await source.initialize();
  await control.query(
    "INSERT INTO platform.tenants(id,code,name,database_name,enabled,demo_auth,provisioning_status) VALUES($1,$2,$3,$4,true,true,'READY')",
    [tenantId, code, '企业标识测试（临时）', dbName],
  );
  await control.query(
    "INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,'cs_operator',$4,$5)",
    [membershipId, tenantId, subjectId, '13898765001', '临时管理员'],
  );
  let r = await api('/admin/company');
  assert.equal(r.status, 200);
  let company = r.data;
  assert.equal(company.id, tenantId);
  assert(!('database_name' in company));
  assert(!('code' in company));
  assert.equal(company.logoDataUrl, null);
  r = await api('/admin/company', 'PUT', {
    version: company.version,
    name: '品牌测试有限公司',
    shortName: '品牌测试',
    email: 'brand@example.com',
    website: 'https://brand.example.com',
    industry: '测试服务',
    description: '自动测试企业简介',
    contactName: '测试联系人',
    contactPhone: '021-12345678',
    address: '测试地址',
    serviceArea: '测试区域',
    serviceHours: '09:00–18:00',
    features: ['unauthorized'],
    tenantId: before[0].id,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  company = r.data;
  assert.equal(company.name, '品牌测试有限公司');
  assert.equal(company.profile.shortName, '品牌测试');
  const nullable=await api('/admin/company','PUT',{version:company.version,name:company.name,shortName:null,contactName:null});assert.equal(nullable.status,200);company=nullable.data;assert.equal(company.profile.shortName,'品牌测试');assert.equal(company.contactName,'测试联系人');
  assert.equal(
    (
      await control.query('SELECT features FROM platform.tenants WHERE id=$1', [
        tenantId,
      ])
    ).rows[0].features.includes('unauthorized'),
    false,
  );
  assert.equal(
    (await api('/admin/company', 'PUT', { version: 1, name: '覆盖失败' }))
      .status,
    409,
  );
  assert.equal(
    (
      await api('/admin/company', 'PUT', {
        version: company.version,
        name: ' ',
        website: 'https://safe.example.com',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api('/admin/company', 'PUT', {
        version: company.version,
        name: '品牌测试有限公司',
        website: 'javascript:alert(1)',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api('/admin/company', 'PUT', {
        version: company.version,
        name: '品牌测试有限公司',
        email: 'bad',
      })
    ).status,
    400,
  );
  console.log('PASS 企业资料保存、版本冲突、字段校验及平台权限隔离');
  const png = await fs.readFile(
    path.join(root, 'assets/company-demo/huadong-logo.png'),
  );
  r = await logo(png, company.version);
  assert.equal(r.status, 201, JSON.stringify(r));
  company = r.data;
  const metadata = await sharp(
    Buffer.from(company.logoDataUrl.split(',')[1], 'base64'),
  ).metadata();
  assert.equal(metadata.format, 'png');
  assert(metadata.width <= 512);
  assert.equal(
    (
      await logo(
        Buffer.from('<svg onload="alert(1)"></svg>'),
        company.version,
        'fake.png',
      )
    ).status,
    400,
  );
  assert.equal(
    (await logo(Buffer.alloc(2 * 1024 * 1024 + 1), company.version)).status,
    413,
  );
  assert.equal(
    (await api('/admin/company/logo?version=1', 'DELETE')).status,
    409,
  );
  r = await api('/admin/company/logo?version=' + company.version, 'DELETE');
  assert.equal(r.status, 200);
  company = r.data;
  assert.equal(company.logoDataUrl, null);
  r = await logo(png, company.version);
  company = r.data;
  console.log('PASS Logo规范化、非法图片及超限拦截、移除与恢复');
  const cm = randomUUID(),
    cs = randomUUID();
  await control.query(
    "INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,'customer',$4,$5)",
    [cm, tenantId, cs, '13898765002', '临时客户'],
  );
  const customerAuth = jwt.sign(
    {
      sub: cs,
      tenantId,
      membershipId: cm,
      version: 1,
      phone: '13898765002',
      role: 'customer',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
  assert.equal(
    (await api('/admin/company', 'GET', undefined, customerAuth)).status,
    403,
  );
  const employee = (
    await control.query(
      "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' LIMIT 1",
      [before[0].id],
    )
  ).rows[0];
  const other = jwt.sign(
    {
      sub: employee.subject_id,
      tenantId: employee.tenant_id,
      membershipId: employee.id,
      version: employee.version,
      phone: employee.phone,
      role: 'cs_operator',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
  const otherCompany = (await api('/admin/company', 'GET', undefined, other))
    .data;
  assert.notEqual(otherCompany.id, tenantId);
  assert.notEqual(otherCompany.logoDataUrl, company.logoDataUrl);
  console.log('PASS 客户账号无编辑权限、企业标识按账号隔离');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9324'),
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
  try {
    await context.addInitScript(
      (s) => {
        sessionStorage.setItem('cs_admin_token', s.auth);
        sessionStorage.setItem(
          'cs_admin_user',
          JSON.stringify({
            tenantId: s.tenantId,
            tenantName: '旧名称缓存',
            name: '临时管理员',
          }),
        );
      },
      { auth, tenantId },
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3100/company');
    await page.getByLabel('企业全称', { exact: true }).waitFor();
    await page.getByLabel('企业简称', { exact: true }).fill('多窗口同步');
    await page
      .getByRole('button', { name: '保存企业资料', exact: true })
      .click();
    await page
      .locator('.sidebar .company-brand')
      .getByText('多窗口同步', { exact: true })
      .waitFor();
    assert((await page.title()).startsWith('多窗口同步'));
    assert(
      (await page.locator('link[rel=icon]').getAttribute('href')).startsWith(
        'data:image/png;base64,',
      ),
    );
    const second = await context.newPage();
    await second.goto('http://localhost:3100/company');
    await second
      .getByLabel('企业简介', { exact: true })
      .fill('此输入在并发冲突后应保留');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
    await page
      .getByRole('status')
      .filter({ hasText: '企业 Logo 已更新' })
      .waitFor();
    await second
      .getByRole('alert')
      .filter({ hasText: '资料已在其他窗口更新' })
      .waitFor();
    await second
      .getByRole('button', { name: '保存企业资料', exact: true })
      .click();
    await second
      .getByRole('alert')
      .filter({ hasText: '企业资料已被其他管理员更新' })
      .waitFor();
    assert.equal(
      await second.getByLabel('企业简介', { exact: true }).inputValue(),
      '此输入在并发冲突后应保留',
    );
    second.once('dialog', (d) => d.dismiss());
    await second.locator('nav a[href="/orders"]').click();
    assert(second.url().endsWith('/company'));
    await second
      .getByRole('button', { name: '重新加载 / 放弃修改', exact: true })
      .click();
    await second
      .getByRole('button', { name: '保存企业资料', exact: true })
      .waitFor({ state: 'visible' });
    assert(
      await second
        .getByRole('button', { name: '保存企业资料', exact: true })
        .isDisabled(),
    );
    await page.screenshot({
      path: path.join(root, '.local-preview/company-settings-review.png'),
    });
    await page.locator('nav a[href="/"]').click();
    await page
      .getByRole('heading', { name: '品牌测试有限公司', exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(root, '.local-preview/company-overview-review.png'),
    });
    await page.locator('nav a[href="/service-desk"]').click();
    await page
      .locator('header .company-brand')
      .getByText('多窗口同步', { exact: true })
      .waitFor();
    await page.setViewportSize({ width: 1024, height: 900 });
    assert(await page.locator('header .company-brand').isVisible());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://localhost:3100/company');
    await page.evaluate(
      () => (document.documentElement.dataset.adminTheme = 'black'),
    );
    await page.screenshot({
      path: path.join(root, '.local-preview/company-black-review.png'),
    });
    if (errors.length) throw Error(errors.join(';'));
    console.log(
      'PASS 真实浏览器保存、跨窗口同步、冲突保留输入、离开保护、首页及客服工作台标识',
    );
  } finally {
    await context.close();
    await browser.close();
  }
  const pa = (
    await control.query(
      'SELECT * FROM platform.admins WHERE enabled=true LIMIT 1',
    )
  ).rows[0];
  const platformAuth = jwt.sign(
    {
      sub: pa.id,
      role: 'platform_admin',
      purpose: 'platform_access',
      version: pa.version,
    },
    { expiresIn: '1h' },
  );
  r = await api(
    '/platform/tenants/' + tenantId,
    'GET',
    undefined,
    platformAuth,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.name, '品牌测试有限公司');
  assert.equal(r.data.companyProfile.shortName, '多窗口同步');
  assert(r.data.logoDataUrl);
  assert.equal(
    JSON.stringify(before),
    JSON.stringify(
      (
        await control.query(
          'SELECT id,name,company_version FROM platform.tenants WHERE id<>$1 ORDER BY id',
          [tenantId],
        )
      ).rows,
    ),
  );
  const logs = (
    await control.query(
      'SELECT action,after_data FROM platform.audit_logs WHERE tenant_id=$1',
      [tenantId],
    )
  ).rows;
  assert(logs.some((l) => l.action === 'COMPANY_LOGO_UPDATED'));
  assert(!JSON.stringify(logs).includes('base64'));
  console.log(
    'PASS 维保云资料同步、变更日志记录且不存图片正文、其他企业无变更',
  );
  const platformBrowser = await chromium.connectOverCDP(
      'http://127.0.0.1:9324',
    ),
    platformContext = await platformBrowser.newContext();
  try {
    await platformContext.addInitScript(
      (token) => sessionStorage.setItem('platform_admin_token', token),
      platformAuth,
    );
    const page = await platformContext.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('http://localhost:3103/index.html');
    await page.locator('[data-view="tenants"]').click();
    await page
      .locator('[data-tenant-id="' + tenantId + '"] .tenant-company-logo')
      .waitFor();
    await page.locator('[data-detail="' + tenantId + '"]').click();
    await page.getByRole('dialog').locator('.tenant-company-logo').waitFor();
    assert.equal(pageErrors.length, 0, pageErrors.join(';'));
    console.log('PASS 维保云列表及开通详情真实显示企业Logo');
  } finally {
    await platformContext.close();
    await platformBrowser.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (source?.isInitialized) await source.destroy();
  await control.query('DELETE FROM platform.audit_logs WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM platform.memberships WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM platform.tenants WHERE id=$1', [tenantId]);
  if (/^laser_brand_test_\d+$/.test(dbName))
    await control.query(
      'DROP DATABASE IF EXISTS "' + dbName + '" WITH (FORCE)',
    );
  await control.end();
  console.log('CLEANUP 临时企业及数据库已清理');
}
