import 'reflect-metadata';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
process.env.DB_DATABASE = (
  await fs.readFile(path.join(root, '.local-preview/database.txt'), 'utf8')
).trim();
const cfg = {
    host: 'localhost',
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  control = new pg.Client({ ...cfg, database: process.env.DB_DATABASE });
await control.connect();
const tenantId = randomUUID(),
  subjectId = randomUUID(),
  membershipId = randomUUID(),
  dbName = 'laser_import_test_' + Date.now(),
  code = 'import-' + Date.now();
let source;
const phone = '13898765431';
const jwt = new JwtService({ secret: process.env.JWT_SECRET }),
  token = jwt.sign(
    {
      sub: subjectId,
      tenantId,
      membershipId,
      phone: '13898765430',
      version: 1,
      role: 'cs_operator',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
let customerToken, uploadedFile;
async function call(p, body, auth = token) {
  const response = await fetch('http://localhost:8180' + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + auth,
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const value = await response.json();
  return { status: response.status, data: value };
}
async function upload(action, buffer, ticket, auth = token) {
  const body = new FormData();
  body.append('file', new Blob([buffer]), 'test.xlsx');
  if (ticket) body.append('token', ticket);
  return call('/admin/customer-import/' + action, body, auth);
}
async function uploadDevice(action, buffer, ticket) {
  const body = new FormData();
  body.append('file', new Blob([buffer]), 'devices.xlsx');
  if (ticket) body.append('token', ticket);
  return call('/admin/device-import/' + action, body);
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
    "INSERT INTO platform.tenants(id,code,name,database_name,enabled,demo_auth,provisioning_status,features) VALUES($1,$2,$3,$4,true,true,'READY',$5)",
    [
      tenantId,
      code,
      'Excel导入自动测试（临时）',
      dbName,
      JSON.stringify(['contracts', 'finance']),
    ],
  );
  await control.query(
    "INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,'cs_operator',$4,$5)",
    [membershipId, tenantId, subjectId, '13898765430', '临时测试管理员'],
  );
  const { importTemplate } =
    await import('../dist/admin/customer-import-workbook.js');
  const template = await importTemplate(),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  assert.equal(wb.worksheets[0].name, '客户名单');
  assert.equal(
    wb.getWorksheet('客户名单').getCell('A2').value,
    '示例（不导入）',
  );
  assert.equal(wb.getWorksheet('客户名单').getCell('A3').value, '数据');
  assert.equal(wb.getWorksheet('客户名单').actualRowCount, 3);
  const exampleCustomer = wb.getWorksheet('客户名单').getRow(2).values.slice(2),
    exampleDevice = wb.getWorksheet('设备与维保').getRow(2).values.slice(2);
  exampleCustomer[0] = 'TEST-001';
  exampleCustomer[1] = 'Excel导入测试';
  exampleCustomer[2] = phone;
  exampleDevice[1] = 'TEST-001';
  exampleDevice[2] = phone;
  exampleDevice[5] = 'AUTO-IMPORT-' + tenantId;
  wb.getWorksheet('客户名单').getRow(3).values = ['数据', ...exampleCustomer];
  wb.getWorksheet('设备与维保').getRow(3).values = ['数据', ...exampleDevice];
  let bytes = Buffer.from(await wb.xlsx.writeBuffer());
  uploadedFile = bytes;
  let p = await upload('preview', bytes);
  assert.equal(p.data.summary.skippedExamples, 2);
  assert.equal(p.status, 201, JSON.stringify(p));
  assert.equal(p.data.issues.length, 0, JSON.stringify(p.data.issues));
  assert.equal(p.data.summary.newCustomers, 1);
  assert.equal(
    (await source.query('SELECT count(*)::int n FROM customers'))[0].n,
    0,
  );
  console.log('PASS 同页表头/示例/填写行、示例自动跳过且预览不写入');
  let forged = await upload('commit', bytes, 'bad-token');
  assert.equal(forged.status, 400);
  const wrong = Buffer.from(bytes);
  wrong[0] = 0;
  assert.equal((await upload('commit', wrong, p.data.token)).status, 400);
  const foreignMember = randomUUID(),
    foreignTenant = (
      await control.query("SELECT id FROM platform.tenants WHERE code='demo'")
    ).rows[0].id;
  const account = (
    await control.query(
      "SELECT * FROM platform.memberships WHERE tenant_id=$1 AND role='cs_operator' LIMIT 1",
      [foreignTenant],
    )
  ).rows[0];
  const foreignToken = jwt.sign(
    {
      sub: account.subject_id,
      tenantId: foreignTenant,
      membershipId: account.id,
      phone: account.phone,
      version: account.version,
      role: 'cs_operator',
      purpose: 'access',
    },
    { expiresIn: '1h' },
  );
  assert.equal(
    (await upload('commit', bytes, p.data.token, foreignToken)).status,
    400,
  );
  console.log('PASS 无效凭证、改文件、跨企业提交均被阻止');
  let committed = await upload('commit', bytes, p.data.token);
  assert.equal(committed.status, 201, JSON.stringify(committed));
  assert.equal(committed.data.identitySynced, true);
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int n FROM customers WHERE phone='13800001001'",
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int n FROM devices WHERE serial_number='EXAMPLE-SN-001'",
      )
    )[0].n,
    0,
  );
  const customers = (await call('/admin/customers')).data,
    devices = (await call('/admin/devices')).data;
  assert.equal(customers.length, 1);
  assert.equal(devices.length, 1);
  const detail = (await call('/admin/customers/' + customers[0].id)).data;
  assert.equal(detail.addresses.length, 1);
  assert.equal(detail.profile['电子邮箱'], 'customer@example.com');
  assert.equal(detail.profile['设备补充资料'][0]['设备品牌'], '示例品牌');
  p = await upload('preview', bytes);
  assert.equal(p.data.summary.newCustomers, 0);
  assert.equal(p.data.summary.newDevices, 0);
  assert.equal(p.data.summary.newAddresses, 0);
  assert.equal(
    (await upload('commit', bytes, p.data.token)).data.identitySynced,
    true,
  );
  assert.equal(
    (await source.query('SELECT count(*)::int n FROM customers'))[0].n,
    1,
  );
  console.log('PASS 真实整批入库、补充资料、重复上传不重复新增');
  const login = await call(
    '/identity/login',
    { phone, code: '000000', role: 'customer' },
    '',
  );
  assert.equal(login.status, 201);
  customerToken = login.data.accessToken;
  const mine = await call('/customer/devices', undefined, customerToken);
  assert.equal(mine.data.length, 1);
  assert.equal(mine.data[0].serialNumber, exampleDevice[5]);
  const addresses = await call('/customer/addresses', undefined, customerToken);
  assert.equal(addresses.data.length, 1);
  assert.equal(
    (await upload('preview', bytes, undefined, customerToken)).status,
    403,
  );
  console.log('PASS 客户端识别新增客户设备地址；客户端无导入权限');
  const appendBook = new ExcelJS.Workbook();
  await appendBook.xlsx.load(template);
  const appendCustomer = [...exampleCustomer],
    appendDevice = [...exampleDevice];
  appendCustomer[4] = '不覆盖原企业名称';
  appendDevice[5] = 'EXTRA-' + tenantId;
  appendBook.getWorksheet('客户名单').getRow(3).values = [
    '数据',
    ...appendCustomer,
  ];
  appendBook.getWorksheet('设备与维保').getRow(3).values = [
    '数据',
    ...appendDevice,
  ];
  const appendBytes = Buffer.from(await appendBook.xlsx.writeBuffer());
  const appendPreview = await upload('preview', appendBytes);
  assert.equal(
    appendPreview.data.issues.length,
    0,
    JSON.stringify(appendPreview),
  );
  assert.equal(appendPreview.data.summary.skippedCustomers, 1);
  assert.equal(appendPreview.data.summary.newDevices, 1);
  assert.equal(
    (await upload('commit', appendBytes, appendPreview.data.token)).data
      .identitySynced,
    true,
  );
  const appended = (await call('/admin/customers/' + customers[0].id)).data;
  assert.equal(appended.profile['客户单位'], '示例精密制造有限公司');
  assert.equal(appended.profile['设备补充资料'].length, 2);
  assert.equal(appended.devices.length, 2);
  console.log('PASS 已有客户可追加设备和补充资料，客户原资料不覆盖');
  wb.getWorksheet('客户名单').getCell('D3').value = '123';
  let invalid = await upload(
    'preview',
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  assert(
    invalid.data.issues.some((i) => i.row === 3 && i.message.includes('11位')),
  );
  assert.equal(invalid.data.token, null);
  wb.getWorksheet('客户名单').getCell('D3').value = phone;
  wb.getWorksheet('设备与维保').getCell('I3').value = '2026-02-30';
  invalid = await upload('preview', Buffer.from(await wb.xlsx.writeBuffer()));
  assert(invalid.data.issues.some((i) => i.message.includes('日期')));
  wb.getWorksheet('设备与维保').getCell('I3').value = {
    formula: '1+1',
    result: 2,
  };
  invalid = await upload('preview', Buffer.from(await wb.xlsx.writeBuffer()));
  assert(invalid.data.issues.some((i) => i.message.includes('公式')));
  console.log('PASS 行号定位、手机号、无效日期及公式校验');
  p = await upload('preview', bytes);
  await source.query("UPDATE customers SET name='并发变更' WHERE phone=$1", [
    phone,
  ]);
  const conflict = await upload('commit', bytes, p.data.token);
  assert([400, 409].includes(conflict.status));
  await source.query(
    "UPDATE customers SET name='Excel导入测试' WHERE phone=$1",
    [phone],
  );
  console.log('PASS 预览后资料变化须重新检查');
  const legacy = await fs.readFile(
    path.join(root, 'outputs/customer-demo-20261104/模拟客户信息表.xlsx'),
  );
  p = await upload('preview', legacy);
  assert.equal(p.status, 201, JSON.stringify(p));
  assert.equal(p.data.issues.length, 0, JSON.stringify(p.data.issues));
  assert.equal(p.data.summary.newCustomers, 20);
  assert.equal(p.data.summary.newDevices, 24);
  console.log('PASS 原信息表第5行表头兼容，20位客户24台设备可预览');
  const rollbackBook = new ExcelJS.Workbook();
  await rollbackBook.xlsx.load(template);
  const rollbackCustomer = [...exampleCustomer],
    rollbackDevice = [...exampleDevice];
  rollbackCustomer[0] = 'ROLLBACK';
  rollbackCustomer[1] = '回滚验证';
  rollbackCustomer[2] = '13898765432';
  rollbackDevice[1] = 'ROLLBACK';
  rollbackDevice[2] = '13898765432';
  rollbackDevice[5] = 'ROLLBACK-SERIAL';
  rollbackBook.getWorksheet('客户名单').getRow(3).values = [
    '数据',
    ...rollbackCustomer,
  ];
  rollbackBook.getWorksheet('设备与维保').getRow(3).values = [
    '数据',
    ...rollbackDevice,
  ];
  const rollbackBytes = Buffer.from(await rollbackBook.xlsx.writeBuffer());
  p = await upload('preview', rollbackBytes);
  assert.equal(p.data.issues.length, 0);
  await source.query(
    "CREATE FUNCTION reject_import_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.serial_number='ROLLBACK-SERIAL' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$",
  );
  await source.query(
    'CREATE TRIGGER reject_import_test BEFORE INSERT ON devices FOR EACH ROW EXECUTE FUNCTION reject_import_test()',
  );
  assert.equal(
    (await upload('commit', rollbackBytes, p.data.token)).status,
    500,
  );
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int n FROM customers WHERE phone='13898765432'",
      )
    )[0].n,
    0,
  );
  assert.equal(
    (await source.query('SELECT count(*)::int n FROM addresses'))[0].n,
    1,
  );
  await source.query('DROP TRIGGER reject_import_test ON devices');
  await source.query('DROP FUNCTION reject_import_test()');
  console.log('PASS 中途写入失败时客户、设备、地址整批回滚');
  const deviceTemplate = await importTemplate('devices'),
    deviceBook = new ExcelJS.Workbook();
  await deviceBook.xlsx.load(deviceTemplate);
  assert.equal(deviceBook.worksheets[0].name, '设备与维保');
  assert.equal(deviceBook.getWorksheet('客户名单'), undefined);
  const onlyExample = await uploadDevice('preview', deviceTemplate);
  assert.equal(onlyExample.data.token, null);
  assert.equal(onlyExample.data.summary.skippedExamples, 1);
  const standalone = [...exampleDevice];
  standalone[1] = '';
  standalone[2] = phone;
  standalone[5] = 'DEVICE-ONLY-' + tenantId;
  deviceBook.getWorksheet('设备与维保').getRow(3).values = [
    '数据',
    ...standalone,
  ];
  const codeOnly = [...standalone];
  codeOnly[1] = 'TEST-001';
  codeOnly[2] = '';
  codeOnly[5] = 'CODE-ONLY-' + tenantId;
  deviceBook.getWorksheet('设备与维保').getRow(3).values = [
    '数据',
    ...codeOnly,
  ];
  const codePreview = await uploadDevice(
    'preview',
    Buffer.from(await deviceBook.xlsx.writeBuffer()),
  );
  assert.equal(codePreview.data.issues.length, 0, JSON.stringify(codePreview));
  deviceBook.getWorksheet('设备与维保').getRow(3).values = [
    '数据',
    ...standalone,
  ];
  const deviceBytes = Buffer.from(await deviceBook.xlsx.writeBuffer());
  let dp = await uploadDevice('preview', deviceBytes);
  assert.equal(dp.data.issues.length, 0, JSON.stringify(dp));
  assert.equal(dp.data.summary.newCustomers, 0);
  assert.equal(dp.data.summary.newDevices, 1);
  assert.equal(dp.data.summary.skippedExamples, 1);
  assert.equal(
    (await upload('commit', deviceBytes, dp.data.token)).status,
    400,
  );
  assert.equal(
    (await uploadDevice('commit', deviceBytes, dp.data.token)).data
      .identitySynced,
    true,
  );
  assert.equal(
    (await source.query('SELECT count(*)::int n FROM customers'))[0].n,
    1,
  );
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int n FROM devices WHERE serial_number='EXAMPLE-SN-001'",
      )
    )[0].n,
    0,
  );
  dp = await uploadDevice('preview', deviceBytes);
  assert.equal(dp.data.summary.newDevices, 0);
  assert.equal(dp.data.summary.skippedDevices, 1);
  const deviceLogin = (
    await call(
      '/identity/login',
      { phone, code: '000000', role: 'customer' },
      '',
    )
  ).data;
  assert(
    (
      await call('/customer/devices', undefined, deviceLogin.accessToken)
    ).data.some((d) => d.serialNumber === standalone[5]),
  );
  standalone[2] = '13800009999';
  deviceBook.getWorksheet('设备与维保').getRow(3).values = [
    '数据',
    ...standalone,
  ];
  assert(
    (
      await uploadDevice(
        'preview',
        Buffer.from(await deviceBook.xlsx.writeBuffer()),
      )
    ).data.issues.some((i) => i.message.includes('客户')),
  );
  const withoutExample = new ExcelJS.Workbook();
  await withoutExample.xlsx.load(bytes);
  withoutExample.getWorksheet('客户名单').spliceRows(2, 1);
  withoutExample.getWorksheet('设备与维保').spliceRows(2, 1);
  const deleted = await upload(
    'preview',
    Buffer.from(await withoutExample.xlsx.writeBuffer()),
  );
  assert.equal(deleted.data.issues.length, 0);
  assert.equal(deleted.data.rows.length, 2);
  assert.equal(deleted.data.rows[0].row, 2);
  console.log(
    'PASS 设备独立导入、关联已有客户、重复跳过、未知客户拦截、模式隔离与删除示例不丢首条真实数据',
  );
  // Browser exercises real upload/preview/commit in this disposable tenant.
  const { chromium } = await import('playwright');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9324'),
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
  try {
    await context.addInitScript(
      (s) => {
        sessionStorage.setItem('cs_admin_token', s.token);
        sessionStorage.setItem('cs_admin_user', JSON.stringify(s.user));
      },
      {
        token,
        user: {
          tenantId,
          tenantName: 'Excel导入自动测试（临时）',
          name: '临时测试管理员',
        },
      },
    );
    const page = await context.newPage();
    await page.goto('http://localhost:3100/');
    await page.locator('nav a[href="/customers"]').click();
    await page.getByRole('button', { name: '导入 Excel', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const downloadEvent = page.waitForEvent('download');
    await dialog
      .getByRole('button', { name: '下载模板（含示例）', exact: true })
      .click();
    const download = await downloadEvent;
    assert(download.suggestedFilename().endsWith('.xlsx'));
    const invalidBook = new ExcelJS.Workbook();
    await invalidBook.xlsx.load(template);
    const invalidRow = [...exampleCustomer];
    invalidRow[2] = '123';
    invalidBook.getWorksheet('客户名单').getRow(3).values = [
      '数据',
      ...invalidRow,
    ];
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'invalid.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await invalidBook.xlsx.writeBuffer()),
    });
    await dialog.getByRole('button', { name: '检查文件', exact: true }).click();
    await dialog.getByText(/发现 .* 项错误，尚未写入任何数据/).waitFor();
    assert(
      await dialog
        .getByRole('button', { name: '确认导入', exact: true })
        .isDisabled(),
    );
    const errorDownload = page.waitForEvent('download');
    await dialog
      .getByRole('button', { name: '下载错误清单', exact: true })
      .click();
    assert((await errorDownload).suggestedFilename().endsWith('.csv'));
    await page.screenshot({
      path: path.join(root, '.local-preview/import-errors-review.png'),
    });
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'test.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await dialog.getByRole('button', { name: '检查文件', exact: true }).click();
    await dialog
      .getByText('检查通过。请核对预览后确认导入到当前登录企业。', {
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: path.join(root, '.local-preview/import-preview-review.png'),
    });
    await page.evaluate(
      () => (document.documentElement.dataset.adminTheme = 'black'),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await dialog.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth;
      }),
    );
    await page.screenshot({
      path: path.join(root, '.local-preview/import-mobile-review.png'),
    });
    await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    await dialog.getByText('导入完成', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await page
      .locator('tbody')
      .getByText('Excel导入测试', { exact: true })
      .waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('nav a[href="/devices"]').click();
    await page.getByRole('button', { name: '导入 Excel', exact: true }).click();
    await dialog
      .getByRole('heading', { name: '批量导入设备', exact: true })
      .waitFor();
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'devices.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: deviceBytes,
    });
    await dialog.getByRole('button', { name: '检查文件', exact: true }).click();
    await dialog
      .getByText('已自动跳过 1 条示例，示例不会写入数据库。', { exact: true })
      .waitFor();
    await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await page
      .locator('tbody')
      .getByText(standalone[5], { exact: true })
      .waitFor();
    console.log('PASS 真实浏览器下载模板、选择文件、检查、确认、列表更新');
  } finally {
    await context.close();
    await browser.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (source?.isInitialized) await source.destroy();
  await control.query('DELETE FROM identity.address_links WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM identity.resources WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM identity.assets WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM identity.links WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM platform.memberships WHERE tenant_id=$1', [
    tenantId,
  ]);
  await control.query('DELETE FROM platform.tenants WHERE id=$1', [tenantId]);
  const person = (
    await control.query('SELECT id FROM identity.people WHERE phone=$1', [
      phone,
    ])
  ).rows[0];
  if (person) {
    await control.query(
      'DELETE FROM identity.addresses WHERE person_id=$1 AND NOT EXISTS(SELECT 1 FROM identity.address_links WHERE address_id=identity.addresses.id)',
      [person.id],
    );
    await control.query(
      'DELETE FROM identity.people WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM identity.links WHERE person_id=$1)',
      [person.id],
    );
  }
  if (/^laser_import_test_\d+$/.test(dbName))
    await control.query(
      'DROP DATABASE IF EXISTS "' + dbName + '" WITH (FORCE)',
    );
  await control.end();
  console.log('CLEANUP 临时企业和数据库已清理');
}
