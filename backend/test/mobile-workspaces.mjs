import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { chromium } from 'playwright';
import { checkVisualGalleries } from './visual-gallery-check.mjs';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
const config = {
    host: 'localhost',
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  database = (
    await fs.readFile(path.join(root, '.local-preview/database.txt'), 'utf8')
  ).trim(),
  control = new pg.Client({ ...config, database });
await control.connect();
const jwt = new JwtService({ secret: process.env.JWT_SECRET }),
  stamp = Date.now(),
  customerPhone = '13898' + String(stamp).slice(-6),
  engineerPhone = '13998' + String(stamp).slice(-6),
  tenants = [];
let browser, context;
async function api(url, token, body) {
  const r = await fetch('http://localhost:8180' + url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (token || ''),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  assert(r.ok, url + ' ' + r.status + ' ' + JSON.stringify(data));
  return data;
}
try {
  assert.equal(
    (
      await control.query(
        'SELECT count(*)::int n FROM identity.people WHERE phone=ANY($1)',
        [[customerPhone, engineerPhone]],
      )
    ).rows[0].n,
    0,
  );
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(),
      subject = randomUUID(),
      member = randomUUID(),
      dbName = 'laser_mobile_test_' + stamp + '_' + i,
      t = { id, dbName, name: '移动工作空间验证' + (i ? '乙' : '甲') };
    tenants.push(t);
    await control.query('CREATE DATABASE "' + dbName + '"');
    const source = new DataSource({
      type: 'postgres',
      ...config,
      username: config.user,
      database: dbName,
      entities: [path.join(root, 'backend/dist/database/entities/*.entity.js')],
      synchronize: true,
    });
    t.source = source;
    await source.initialize();
    await control.query(
      "INSERT INTO platform.tenants(id,code,name,database_name,enabled,demo_auth,provisioning_status,company_profile,company_logo) VALUES($1,$2,$3,$4,true,true,'READY',$5::jsonb,$6)",
      [
        id,
        'mobile-' + stamp + '-' + i,
        t.name,
        dbName,
        JSON.stringify({ shortName: i ? '测试乙' : '测试甲' }),
        'data:image/png;base64,' +
          (
            await fs.readFile(
              path.join(root, 'assets/company-demo/huadong-logo.png'),
            )
          ).toString('base64'),
      ],
    );
    await control.query(
      "INSERT INTO platform.memberships(id,tenant_id,subject_id,role,phone,name) VALUES($1,$2,$3,'cs_operator',$4,$5)",
      [
        member,
        id,
        subject,
        '13798' + String(stamp + i).slice(-6),
        '测试管理员',
      ],
    );
    const token = jwt.sign(
      {
        sub: subject,
        tenantId: id,
        membershipId: member,
        version: 1,
        phone: '13798' + String(stamp + i).slice(-6),
        role: 'cs_operator',
        purpose: 'access',
      },
      { expiresIn: '1h' },
    );
    t.token = token;
    t.customer = await api('/admin/customers', token, {
      name: '跨企业测试客户',
      phone: customerPhone,
    });
    t.engineer = await api('/admin/engineers', token, {
      name: '跨企业测试工程师',
      phone: engineerPhone,
    });
    t.device = await api('/admin/devices', token, {
      customerId: t.customer.id,
      serialNumber: 'MOBILE-' + id,
      model: '测试设备' + i,
      deviceType: '激光焊接机',
    });
    const address = await source.getRepository('Address').save({
      customerId: t.customer.id,
      province: '测试省',
      city: '测试市',
      district: '测试区',
      detail: '测试地址' + i,
      isDefault: true,
    });
    t.order = await source.getRepository('WorkOrder').save({
      orderNo: 'MOB' + stamp + String(i),
      customerId: t.customer.id,
      engineerId: t.engineer.id,
      deviceId: t.device.id,
      addressId: address.id,
      faultType: '测试故障' + i,
      status: i ? 'PENDING_PAYMENT' : 'ACCEPTED',
      partsFee: 100,
      laborFee: 100,
      prepayAmount: 50,
      estimatedAmount: 200,
    });
  }
  const customer = await api('/identity/login', null, {
      role: 'customer',
      phone: customerPhone,
      code: '000000',
    }),
    engineer = await api('/identity/login', null, {
      role: 'engineer',
      phone: engineerPhone,
      code: '000000',
    });
  const services = await api('/identity/services', engineer.accessToken);
  assert.equal(services.length, 2);
  assert(services.every((s) => s.logoDataUrl));
  const deviceList = await api('/customer/devices', customer.accessToken);
  assert.equal(deviceList.length, 2);
  console.log(
    'PASS 同一客户和工程师具有两家企业关系，服务商Logo与设备归属正确',
  );
  browser = await chromium.connectOverCDP('http://127.0.0.1:9324');
  context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await context.addInitScript(
    (s) => {
      localStorage.setItem('customer_token', s.customer.accessToken);
      localStorage.setItem('customer_user', JSON.stringify(s.customer.user));
      localStorage.setItem('engineer_token', s.engineer.accessToken);
      localStorage.setItem('engineer_user', JSON.stringify(s.engineer.user));
    },
    { customer, engineer },
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3101/home.html');
  await page
    .getByRole('heading', { name: '今天，有什么需要处理？', exact: true })
    .waitFor();
  await page
    .locator('.customer-todo')
    .getByText('查看并确认维修报价', { exact: true })
    .waitFor();
  await page.getByRole('link', { name: '我的设备', exact: true }).click();
  await page.locator('.customer-service-row').first().waitFor();
  assert.equal(await page.locator('.customer-service-row').count(), 2);
  if (process.env.MOBILE_SCREENSHOTS === '1')
    await page.screenshot({
      path: path.join(
        root,
        '.local-preview/mobile-customer-devices-review.png',
      ),
    });
  const orderList = await api('/customer/work-orders', customer.accessToken),
    orderB = orderList.find((o) => o.orderNo === tenants[1].order.orderNo),
    orderA = orderList.find((o) => o.orderNo === tenants[0].order.orderNo);
  await page.goto('http://localhost:3101/order-progress.html?id=' + orderB.id);
  await page.locator('#customer-next-action').waitFor();
  assert(
    (
      await page.locator('.customer-service-contact').getAttribute('href')
    ).includes(orderB.serviceId),
  );
  if (process.env.MOBILE_SCREENSHOTS === '1')
    await page.screenshot({
      path: path.join(root, '.local-preview/mobile-customer-order-review.png'),
    });
  console.log('PASS 客户首页待办、两家服务商设备卡、工单联系与下一步入口');
  await page.goto('http://localhost:3102/tasks.html#working');
  await page.getByLabel('切换工作企业', { exact: true }).waitFor();
  const firstName = await page.locator('.workspace-brand strong').innerText(),
    firstIndex = tenants.findIndex((t) => t.name === firstName);
  assert(firstIndex >= 0);
  await page
    .locator('#taskList')
    .getByText('测试故障' + firstIndex, { exact: false })
    .waitFor();
  assert.equal(
    await page
      .locator('#taskList')
      .getByText('测试故障' + (1 - firstIndex), { exact: false })
      .count(),
    0,
  );
  const secondService = services.find(
    (s) => s.name === tenants[1 - firstIndex].name,
  );
  await page
    .getByLabel('切换工作企业', { exact: true })
    .selectOption(secondService.id);
  await page
    .locator('.workspace-brand strong')
    .getByText(secondService.name, { exact: true })
    .waitFor();
  const scoped = await page.evaluate(async () => {
    const r = await fetch(window.APP_API_BASE + '/engineer/orders', {
      headers: {
        Authorization: 'Bearer ' + localStorage.getItem('engineer_token'),
      },
    });
    return window.readApiResponse(r);
  });
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].faultType, '测试故障' + (1 - firstIndex));
  await page.goto('http://localhost:3102/inventory.html');
  await page
    .locator('.workspace-brand strong')
    .getByText(secondService.name, { exact: true })
    .waitFor();
  const mobile = await page.evaluate(async () =>
    window.readApiResponse(
      await fetch(window.APP_API_BASE + '/operations/mobile', {
        headers: {
          Authorization: 'Bearer ' + localStorage.getItem('engineer_token'),
        },
      }),
    ),
  );
  assert.equal(mobile.warehouse.serviceName, secondService.name);
  console.log('PASS 工程师切换企业后工单与移动仓均在后端按所选企业查询');
  const aService = services.find((s) => s.name === tenants[0].name);
  await page
    .getByLabel('切换工作企业', { exact: true })
    .selectOption(aService.id);
  await page
    .locator('.workspace-brand strong')
    .getByText(aService.name, { exact: true })
    .waitFor();
  const aOrders = await page.evaluate(async () =>
    window.readApiResponse(
      await fetch(window.APP_API_BASE + '/engineer/orders', {
        headers: {
          Authorization: 'Bearer ' + localStorage.getItem('engineer_token'),
        },
      }),
    ),
  );
  const chosenDevice = deviceList.find(
    (d) => d.serviceName === tenants[0].name,
  );
  assert(chosenDevice);
  await page.goto(
    'http://localhost:3101/repair-form.html?deviceId=' + chosenDevice.id,
  );
  await page
    .locator('#repairDeviceSummary')
    .getByText('SN: ' + chosenDevice.serialNumber, { exact: true })
    .waitFor();
  assert(
    await page.locator('#repairDeviceField').isHidden(),
    '设备卡进入不应重复选择设备',
  );
  await page.locator('[name=faultType]').selectOption('光路故障');
  await page
    .locator('[name=faultDescription]')
    .fill('测试设备在运行时发生光路报警，请核实检测。');
  await page.locator('#repairPhotos').setInputFiles({
    name: 'test-fault.webp',
    mimeType: 'image/webp',
    buffer: await fs.readFile(
      path.join(
        root,
        'apps/customer-app-web/media/service-visuals/device-welding.webp',
      ),
    ),
  });
  const intakePromise = page.waitForRequest(
    (r) => r.url().endsWith('/market/device-repairs') && r.method() === 'POST',
  );
  await page.getByRole('button', { name: '提交报修', exact: true }).click();
  const intake = (await intakePromise).postDataJSON();
  await page.waitForURL('**/platform-order.html?id=*');
  const repairId = new URL(page.url()).searchParams.get('id'),
    repair = await api('/market/requests/' + repairId, customer.accessToken);
  assert.equal(repair.device_ref, chosenDevice.id);
  assert.equal(repair.device_serial, chosenDevice.serialNumber);
  assert.equal(repair.commissioner_id, tenants[0].id);
  assert.equal(repair.provider_id, null);
  assert.equal(repair.intake.source, 'DEVICE_REPAIR');
  assert.equal(repair.status, 'REQUESTED');
  assert.equal(repair.photos.length, 1);
  assert.equal(
    (await api('/market/device-repairs', customer.accessToken, intake)).id,
    repairId,
    '同一提交重试应返回同一单据',
  );
  assert.equal(
    (await api('/market/requests/' + repairId, tenants[0].token)).device_serial,
    chosenDevice.serialNumber,
  );
  assert(
    !(await api('/market/company', tenants[1].token)).requests.some(
      (r) => r.id === repairId,
    ),
  );
  const platformAdmin = (
      await control.query(
        'SELECT id,version FROM platform.admins WHERE enabled LIMIT 1',
      )
    ).rows[0],
    platformToken = jwt.sign(
      {
        sub: platformAdmin.id,
        version: platformAdmin.version,
        purpose: 'platform_access',
        role: 'platform_admin',
      },
      { expiresIn: '1h' },
    );
  assert(
    (await api('/market/platform', platformToken)).requests.some(
      (r) => r.id === repairId && r.device_serial === chosenDevice.serialNumber,
    ),
  );
  const photo = '/market/attachments/' + repair.photos[0].id;
  for (const [token, allowed] of [
    [customer.accessToken, true],
    [tenants[0].token, true],
    [platformToken, true],
    [engineer.accessToken, false],
    [tenants[1].token, false],
  ]) {
    const response = await fetch('http://localhost:8180' + photo, {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(response.ok, allowed, '故障图片权限');
  }
  const foreign = await api('/identity/login', null, {
    role: 'customer',
    phone: engineerPhone,
    code: '000000',
  });
  const forbidden = await fetch('http://localhost:8180/market/device-repairs', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + foreign.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...intake, clientRequestId: randomUUID() }),
  });
  assert.equal(forbidden.status, 403, '其他账号不能冒用设备报修');
  assert.equal(
    (await api('/customer/work-orders', customer.accessToken)).length,
    2,
    '平台报修不应重复创建企业工单',
  );
  await page.locator('#faultPhotos img').waitFor();
  if (process.env.VISUAL_GALLERY_AUDIT === '1')
    await checkVisualGalleries({
      context,
      api,
      control,
      root,
      customer,
      engineer,
      foreign,
      tenants,
      device: chosenDevice,
      repairId,
      platformToken,
      services,
    });
  await page.goto('http://localhost:3101/market-orders.html');
  await page.locator('#unifiedOrderList .market-order-card').nth(2).waitFor();
  assert.equal(
    await page.locator('#unifiedOrderList .market-order-card').count(),
    3,
  );
  await page.locator('#orderSource').selectOption('company');
  assert.equal(
    await page.locator('#unifiedOrderList .market-order-card').count(),
    2,
  );
  await page.locator('#orderSource').selectOption('platform');
  assert.equal(
    await page.locator('#unifiedOrderList .market-order-card').count(),
    1,
  );
  if (process.env.MOBILE_SCREENSHOTS === '1') {
    await page.locator('#orderSource').selectOption('all');
    await page.screenshot({
      path: path.join(root, '.local-preview/unified-orders-review.png'),
      fullPage: true,
    });
    await page.goto(
      'http://localhost:3101/repair-form.html?deviceId=' + chosenDevice.id,
    );
    await page.locator('#repairDeviceSummary strong').waitFor();
    await page.screenshot({
      path: path.join(root, '.local-preview/device-repair-review.png'),
      fullPage: true,
    });
  }
  const agreement = await api('/operations/contracts', tenants[0].token, {
    customerId: tenants[0].customer.id,
    title: '测试既有设备维保合同',
    startDate: '2026-01-01',
    endDate: '2030-12-31',
    amount: 0,
    laborIncluded: true,
    partsDiscount: 90,
    deviceIds: [tenants[0].device.id],
    terms: '测试保留既有合同流程',
  });
  await api(
    '/operations/contracts/' + agreement.id + '/status',
    tenants[0].token,
    { status: 'ACTIVE' },
  );
  const agreementAlias = (
    await api('/operations/contracts', customer.accessToken)
  ).find((c) => c.title === '测试既有设备维保合同');
  assert(agreementAlias);
  await page.goto(
    'http://localhost:3101/repair-form.html?deviceId=' + chosenDevice.id,
  );
  await page.locator('#repairDeviceSummary strong').waitFor();
  await page.locator('#repairContractDetails summary').click();
  await page.locator('[name=contractId]').selectOption(agreementAlias.id);
  await page.locator('[name=faultType]').selectOption('光路故障');
  await page
    .locator('[name=faultDescription]')
    .fill('合同内设备故障，验证已有保障按原协议受理。');
  await page.getByRole('button', { name: '提交报修', exact: true }).click();
  await page.waitForURL('**/order-progress.html#*');
  const contractOrder = await api(
    '/customer/work-orders/' + new URL(page.url()).hash.slice(1),
    customer.accessToken,
  );
  assert.equal(contractOrder.contractTerms.laborIncluded, true);
  assert.equal(Number(contractOrder.contractTerms.partsDiscount), 90);
  assert.equal(
    (await api('/market/requests', customer.accessToken)).length,
    1,
    '企业合同报修不应重复进入平台',
  );
  console.log(
    'PASS 设备入口免重复选择；SN 后端核验；平台派单；照片权限；重复提交防护；统一订单；企业合同权益保留',
  );
  await page.goto('http://localhost:3102/task-detail.html#' + aOrders[0].id);
  await page.locator('#workspace-next-action').waitFor();
  if (process.env.MOBILE_SCREENSHOTS === '1')
    await page.screenshot({
      path: path.join(root, '.local-preview/mobile-engineer-order-review.png'),
    });
  if (process.env.MOBILE_DESIGN_AUDIT === '1') {
    const customerPages = [
      'devices.html',
      'addresses.html',
      'orders.html',
      'profile.html',
      'business.html',
      'warranty.html',
      'repair-form.html',
      'order-progress.html#' + orderA.id,
      'quote-confirm.html#' + orderB.id,
      'pay.html?orderId=' + orderB.id,
      'refund.html',
      'chat.html',
    ];
    const engineerPages = [
      'tasks.html',
      'grab.html',
      'history.html',
      'inventory.html',
      'profile.html',
      'stats.html',
      'task-detail.html#' + aOrders[0].id,
      'quote.html#' + aOrders[0].id,
      'signature.html#' + aOrders[0].id,
      'ai-assistant.html',
      'repair-assist.html',
    ];
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [port, pages] of [
        [3101, customerPages],
        [3102, engineerPages],
      ])
        for (const route of pages) {
          await page.goto('http://localhost:' + port + '/' + route);
          await page.locator('body.mobile-system,body.market-body').waitFor();
          await page.waitForTimeout(100);
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            '横向溢出 ' + width + ' ' + route,
          );
          const header = (await page.locator('body>header').count())
            ? await page.locator('body>header').boundingBox()
            : null;
          if (header) {
            assert(
              header.x >= -1 && header.x + header.width <= width + 1,
              '标题栏超出视口 ' + route,
            );
            assert(header.height >= 63, '标题栏高度 ' + route);
          }
          if (
            width === 430 &&
            [
              'devices.html',
              'profile.html',
              'inventory.html',
              'tasks.html',
              'chat.html',
              'ai-assistant.html',
            ].includes(route) &&
            process.env.MOBILE_SCREENSHOTS === '1'
          )
            await page.screenshot({
              path: path.join(
                root,
                '.local-preview/continuity-' +
                  port +
                  '-' +
                  route.replace('.html', '') +
                  '.png',
              ),
              fullPage: true,
            });
        }
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('http://localhost:3101/addresses.html');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await page.locator('#addressModal .modal').waitFor();
    const addressModal = await page
      .locator('#addressModal .modal')
      .boundingBox();
    assert(addressModal.x >= 0 && addressModal.x + addressModal.width <= 320);
    await page.keyboard.press('Escape');
    await page.locator('#addressModal').waitFor({ state: 'hidden' });
    await page.goto('http://localhost:3102/inventory.html');
    await page
      .locator('#warehouseName')
      .getByText('正在加载…')
      .waitFor({ state: 'hidden' });
    for (const label of ['申请领料', '登记工单用料', '申请退料']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator('#materialDialog[open]').waitFor();
      const box = await page.locator('#materialDialog').boundingBox();
      assert(
        box.x >= 0 && box.x + box.width <= 320 && box.height <= 700,
        '移动仓表单超出屏幕',
      );
      await page
        .getByRole('button', { name: '关闭用料窗口', exact: true })
        .click();
    }
    console.log(
      'PASS 23 个现有业务页在 320/430/1280 宽度检查；地址弹窗关闭；移动仓三个弹窗可完整打开',
    );
  }
  await page.goto('http://localhost:3102/platform-orders.html');
  await page.locator('#orderCount').waitFor();
  await page.locator('#orderSearch').fill(aOrders[0].orderNo);
  await page.locator('.market-order-card').first().waitFor();
  await page.locator('.market-order-card').first().click();
  await page.locator('#flowNext').waitFor();
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForFunction(
    (number) => document.getElementById('orderSearch')?.value === number,
    aOrders[0].orderNo,
  );
  await page.reload();
  await page.waitForFunction(
    (number) => document.getElementById('orderSearch')?.value === number,
    aOrders[0].orderNo,
  );
  await page.goto('http://localhost:3102/inventory.html');
  await page.locator('#stockResult').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '申请领料', exact: true }).click();
  await page.locator('#materialDialog[open]').waitFor();
  assert.equal(
    await page
      .locator('#materialDialog')
      .evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  await page.keyboard.press('Escape');
  await page.locator('#materialDialog').waitFor({ state: 'hidden' });
  assert(
    await page
      .getByRole('button', { name: '申请领料', exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log(
    'PASS 工程师返回及刷新保留筛选；减少动态效果；Escape 关闭弹窗并恢复焦点',
  );
  if (errors.length) throw Error(errors.join(';'));
  console.log('PASS 工程师任务下一步操作、独立绿色风格，无页面脚本错误');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  const marketPeople = (
    await control.query('SELECT id FROM identity.people WHERE phone=ANY($1)', [
      [customerPhone, engineerPhone],
    ])
  ).rows.map((p) => p.id);
  const marketRequests = (
    await control.query(
      'SELECT id FROM market.requests WHERE customer_id=ANY($1::uuid[])',
      [marketPeople],
    )
  ).rows.map((r) => r.id);
  const visualMedia = (
    await control.query(
      'DELETE FROM market.visuals WHERE actor_id=ANY($1::uuid[]) OR tenant_id=ANY($2::uuid[]) RETURNING id',
      [marketPeople, tenants.map((t) => t.id)],
    )
  ).rows;
  for (const file of visualMedia)
    await fs
      .unlink(
        path.join(root, 'backend/private-market-media', file.id + '.webp'),
      )
      .catch(() => {});
  await control.query(
    'DELETE FROM market.qualifications WHERE person_id=ANY($1::uuid[])',
    [marketPeople],
  );
  await control.query(
    'DELETE FROM market.engineers WHERE person_id=ANY($1::uuid[])',
    [marketPeople],
  );
  const media = (
    await control.query(
      'SELECT id FROM market.attachments WHERE owner_id=ANY($1::uuid[])',
      [marketPeople],
    )
  ).rows;
  await control.query(
    'DELETE FROM market.attachments WHERE owner_id=ANY($1::uuid[])',
    [marketPeople],
  );
  for (const file of media) {
    if (/^[0-9a-f-]{36}$/.test(file.id))
      await fs
        .unlink(
          path.join(root, 'backend/private-market-media', file.id + '.webp'),
        )
        .catch(() => {});
  }
  await control.query(
    'DELETE FROM market.events WHERE request_id=ANY($1::uuid[])',
    [marketRequests],
  );
  await control.query('DELETE FROM market.requests WHERE id=ANY($1::uuid[])', [
    marketRequests,
  ]);
  for (const t of tenants) {
    if (t.source?.isInitialized) await t.source.destroy();
    for (const table of [
      'identity.address_links',
      'identity.resources',
      'identity.assets',
      'identity.links',
      'platform.memberships',
      'platform.audit_logs',
    ])
      await control.query('DELETE FROM ' + table + ' WHERE tenant_id=$1', [
        t.id,
      ]);
    await control.query('DELETE FROM platform.tenants WHERE id=$1', [t.id]);
    if (/^laser_mobile_test_\d+_[01]$/.test(t.dbName))
      await control.query(
        'DROP DATABASE IF EXISTS "' + t.dbName + '" WITH (FORCE)',
      );
  }
  for (const phone of [customerPhone, engineerPhone]) {
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
  }
  await control.end();
  console.log('CLEANUP 临时企业及测试数据已清理');
}
