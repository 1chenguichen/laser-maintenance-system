import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import { JwtService } from '@nestjs/jwt';
import { chromium } from 'playwright';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
const db = new pg.Client({
  host: 'localhost',
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: (
    await fs.readFile(path.join(root, '.local-preview/database.txt'), 'utf8')
  ).trim(),
});
await db.connect();
const jwt = new JwtService({ secret: process.env.JWT_SECRET }),
  stamp = Date.now(),
  prefix = 'MARKET-TEST-' + stamp,
  people = [],
  offers = [],
  courses = [],
  requests = [],
  eventIds = [];
let browser, context;
async function api(url, token, body, expected = 200) {
  const r = await fetch('http://localhost:8180' + url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + (token || ''),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  assert(
    expected === 200 ? r.ok : r.status === expected,
    url + ' ' + r.status + ' ' + JSON.stringify(data),
  );
  return data;
}
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
  for (let i = 0; i < 4; i++) {
    const phone = '13697' + String(stamp + i).slice(-6);
    assert.equal(
      (await db.query('SELECT 1 FROM identity.people WHERE phone=$1', [phone]))
        .rowCount,
      0,
    );
    const login = await api('/identity/login', null, {
      phone,
      code: '000000',
      role: 'customer',
    });
    people.push({ ...login, phone, id: login.user.id });
  }
  const [customer, other, worker, rival] = people;
  const tenantRows = (
    await db.query(
      "SELECT t.id,m.subject_id,m.id membership_id,m.version,m.phone FROM platform.tenants t JOIN platform.memberships m ON m.tenant_id=t.id AND m.role='cs_operator' AND m.enabled WHERE t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) ORDER BY t.created_at LIMIT 2",
    )
  ).rows;
  assert.equal(tenantRows.length, 2);
  const companies = tenantRows.map((t) => ({
    ...t,
    token: jwt.sign(
      {
        sub: t.subject_id,
        membershipId: t.membership_id,
        tenantId: t.id,
        version: t.version,
        phone: t.phone,
        role: 'cs_operator',
        purpose: 'access',
      },
      { expiresIn: '1h' },
    ),
  }));
  await api('/market/platform', customer.accessToken, undefined, 403);
  await api(
    '/identity/login',
    null,
    { phone: worker.phone, code: '000000', role: 'engineer' },
    403,
  );
  for (const p of [worker, rival]) {
    await api('/market/engineer-profile', p.accessToken, {
      name: p === worker ? '测试工程师甲' : '测试工程师乙',
      mode: 'INDEPENDENT',
      cities: ['测试市'],
      introduction: '自动化测试工程师申请资料',
    });
    await api('/market/platform', platform, {
      type: 'review',
      personId: p.id,
      state: 'APPROVED',
      note: '自动化测试审核',
    });
    p.engineerToken = (
      await api('/identity/login', null, {
        phone: p.phone,
        code: '000000',
        role: 'engineer',
      })
    ).accessToken;
  }
  for (const tenantId of [null, companies[0].id]) {
    const title = prefix + '-' + offers.length;
    await api('/market/platform', platform, {
      type: 'offer',
      title,
      category: 'welding',
      city: '全国',
      description: '自动化测试服务项目说明',
      tenantId,
    });
    offers.push(
      (await db.query('SELECT id FROM market.offers WHERE title=$1', [title]))
        .rows[0].id,
    );
  }
  const title = prefix + '-course';
  await api('/market/platform', platform, {
    type: 'course',
    title,
    skill: 'welding',
    city: '测试市',
    centerName: '测试培训中心',
    address: '测试培训中心地址',
    startDate: '2026-01-01',
    capacity: 2,
    description: '自动化测试课程内容说明',
  });
  courses.push(
    (await db.query('SELECT id FROM market.courses WHERE title=$1', [title]))
      .rows[0].id,
  );
  await api(
    '/market/platform',
    platform,
    {
      type: 'course',
      title,
      skill: 'welding',
      city: '测试市',
      centerName: '测试培训中心',
      address: '测试培训中心地址',
      startDate: '2026-02-30',
      capacity: 2,
      description: '自动化测试课程内容说明',
    },
    400,
  );
  for (const offerId of offers) {
    const r = await api('/market/requests', customer.accessToken, {
      offerId,
      deviceModel: '测试焊接设备',
      city: '测试市',
      address: '测试保密地址001',
      description: '自动化测试焊接故障记录',
    });
    requests.push(r.id);
  }
  const id = requests[0],
    action = '/market/requests/' + id + '/action';
  await api(action, worker.engineerToken, { action: 'claim', version: 1 }, 403);
  for (const p of [worker, rival])
    await api('/market/courses/' + courses[0] + '/enroll', p.engineerToken, {});
  await api(
    '/market/courses/' + courses[0] + '/enroll',
    customer.accessToken,
    {},
    409,
  );
  await api(
    '/market/courses/' + courses[0] + '/enroll',
    worker.engineerToken,
    {},
    409,
  );
  assert.equal(
    (await api('/market/me', worker.engineerToken)).qualifications.length,
    0,
  );
  await api(action, worker.engineerToken, { action: 'claim', version: 1 }, 403);
  for (const p of [worker, rival]) {
    const enrollment = (
      await db.query(
        'SELECT id FROM market.enrollments WHERE person_id=$1 AND course_id=$2',
        [p.id, courses[0]],
      )
    ).rows[0];
    await api('/market/platform', platform, {
      type: 'assessment',
      enrollmentId: enrollment.id,
      result: 'PASSED',
      note: '测试实操考核通过',
    });
  }
  const pool = await api('/market/pool', worker.engineerToken);
  assert(pool.some((r) => r.id === id));
  assert(!pool.some((r) => r.id === requests[1]));
  assert(!JSON.stringify(pool).includes('测试保密地址001'));
  assert(!JSON.stringify(pool).includes(customer.phone));
  await api('/market/requests/' + id, worker.engineerToken, undefined, 404);
  await api('/market/requests/' + id, other.accessToken, undefined, 404);
  await api(
    '/market/requests/' + requests[1],
    companies[1].token,
    undefined,
    404,
  );
  assert(
    (await api('/market/company', companies[0].token)).requests.some(
      (r) => r.id === requests[1],
    ),
  );
  assert(
    !(await api('/market/company', companies[1].token)).requests.some((r) =>
      requests.includes(r.id),
    ),
  );
  await api(
    '/market/requests/' + requests[1] + '/action',
    worker.engineerToken,
    { action: 'claim', version: 1 },
    403,
  );
  await db.query(
    "UPDATE market.qualifications SET expires_at=now()-interval '1 day' WHERE person_id=$1",
    [worker.id],
  );
  await api(action, worker.engineerToken, { action: 'claim', version: 1 }, 403);
  await db.query(
    "UPDATE market.qualifications SET expires_at=now()+interval '1 year' WHERE person_id=$1",
    [worker.id],
  );
  await db.query(
    'UPDATE market.engineers SET cities=\'["其他市"]\' WHERE person_id=$1',
    [worker.id],
  );
  await api(action, worker.engineerToken, { action: 'claim', version: 1 }, 403);
  await db.query(
    'UPDATE market.engineers SET cities=\'["测试市"]\' WHERE person_id=$1',
    [worker.id],
  );
  const claims = await Promise.all(
    [worker, rival].map((p) =>
      fetch('http://localhost:8180' + action, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + p.engineerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'claim', version: 1 }),
      }),
    ),
  );
  assert.equal(claims.filter((r) => r.ok).length, 1);
  assert.equal(claims.filter((r) => r.status === 409).length, 1);
  const winner = claims[0].ok ? worker : rival,
    loser = claims[0].ok ? rival : worker;
  await api('/market/requests/' + id, loser.engineerToken, undefined, 404);
  await api(
    action,
    winner.engineerToken,
    { action: 'accept', version: 1 },
    409,
  );
  await api(action, winner.engineerToken, { action: 'start', version: 2 }, 400);
  const chain = [
    ['accept', winner.engineerToken, {}],
    [
      'quote',
      winner.engineerToken,
      { amount: 280, note: '测试诊断与维修报价' },
    ],
    ['approve', customer.accessToken, {}],
    ['start', winner.engineerToken, {}],
    [
      'complete',
      winner.engineerToken,
      { report: '测试更换保护镜片并完成通光检查' },
    ],
    ['confirm', customer.accessToken, {}],
  ];
  let version = 2;
  for (const [name, token, extra] of chain)
    await api(action, token, { action: name, version: version++, ...extra });
  const done = await api('/market/requests/' + id, customer.accessToken);
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.events.length, 8);
  assert.equal(Number(done.quote_amount), 280);
  assert.equal(
    (await api('/market/courses', worker.engineerToken)).find(
      (c) => c.id === courses[0],
    ).start_date,
    '2026-01-01',
  );
  // A customer's existing equipment can request another provider without moving the equipment or granting database access.
  const boundCustomer = await api('/identity/login', null, {
    phone: '13800138000',
    code: '000000',
    role: 'customer',
  });
  const devices = await api('/customer/devices', boundCustomer.accessToken);
  assert(devices.length > 0, '演示客户应存在已绑定设备');
  const device = devices[0],
    original = (
      await db.query('SELECT tenant_id FROM identity.resources WHERE id=$1', [
        device.id,
      ])
    ).rows[0].tenant_id;
  const provider = companies.find((c) => c.id !== original);
  const crossOffer = randomUUID();
  offers.push(crossOffer);
  await db.query(
    'INSERT INTO market.offers(id,tenant_id,title,category,city,published) VALUES($1,$2,$3,$4,$5,true)',
    [crossOffer, provider.id, prefix + '-cross', 'welding', '全国'],
  );
  const cross = await api('/market/requests', boundCustomer.accessToken, {
    offerId: crossOffer,
    deviceRef: device.id,
    deviceModel: '由已绑定设备覆盖',
    city: '测试市',
    address: '测试跨企业协作地址',
    description: '测试保留原设备归属并跨企业委托服务',
  });
  requests.push(cross.id);
  const crossDetail = await api('/market/requests/' + cross.id, provider.token);
  assert.equal(crossDetail.commissioner_id, original);
  assert.equal(crossDetail.provider_id, provider.id);
  assert.equal(
    (
      await db.query('SELECT tenant_id FROM identity.resources WHERE id=$1', [
        device.id,
      ])
    ).rows[0].tenant_id,
    original,
  );
  await api(
    '/market/requests/' + cross.id,
    customer.accessToken,
    undefined,
    404,
  );
  console.log(
    'PASS 已绑定设备跨企业委托，原归属保留，承接企业获得单据协作权限',
  );
  console.log(
    'PASS 完整服务闭环；审核、培训、资质、城市、企业权限；并发接单；版本冲突；客户隐私与企业隔离',
  );
  // Verify real pages in an isolated browser context without touching the user's sessions.
  browser = await chromium.connectOverCDP('http://127.0.0.1:9324');
  context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const errors = [];
  context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  await context.addInitScript(
    ({ customer, engineer, platform }) => {
      if (location.port === '3101') {
        localStorage.setItem('customer_token', customer.accessToken);
        localStorage.setItem('customer_user', JSON.stringify(customer.user));
      }
      if (location.port === '3102') {
        localStorage.setItem('engineer_token', engineer.engineerToken);
        localStorage.setItem('engineer_user', JSON.stringify(engineer.user));
      }
      if (location.port === '3103')
        sessionStorage.setItem('platform_admin_token', platform);
    },
    { customer, engineer: winner, platform },
  );
  const page = await context.newPage();
  async function capture(name) {
    if (process.env.MARKET_SCREENSHOTS === '1')
      await page.screenshot({
        path: path.join(root, '.local-preview/' + name + '.png'),
        fullPage: true,
      });
  }
  await page.goto('http://localhost:3101/home.html');
  await page
    .getByRole('heading', { name: '设备服务，随时在身边', exact: true })
    .waitFor();
  await capture('reference-customer-home');
  await page.goto('http://localhost:3101/services.html');
  await page.locator('[data-offer="' + offers[0] + '"]').waitFor();
  await capture('reference-customer-services');
  await page.locator('[data-offer="' + offers[0] + '"]').click();
  await page.locator('[name=deviceModel]').fill('浏览器测试焊接设备');
  await page.locator('#requestForm [name=city]').fill('测试市');
  await page.locator('[name=address]').fill('浏览器测试上门地址');
  await page.locator('[name=description]').fill('浏览器提交服务需求测试');
  await page.locator('#requestForm button').click();
  await page.waitForURL('**/platform-order.html?id=*');
  requests.push(new URL(page.url()).searchParams.get('id'));
  await page
    .getByRole('heading', { name: '服务单详情', exact: true })
    .waitFor();
  await capture('reference-customer-detail');
  if (process.env.MARKET_SCREENSHOTS === '1')
    await page.screenshot({
      path: path.join(root, '.local-preview/market-customer-review.png'),
      fullPage: true,
    });
  const browserRequest = requests[requests.length - 1];
  await api(
    '/market/requests/' + browserRequest + '/action',
    winner.engineerToken,
    { action: 'claim', version: 1 },
  );
  const extra = await api('/market/requests', customer.accessToken, {
    offerId: offers[0],
    deviceModel: '待诊断激光焊接机',
    city: '测试市',
    address: '测试设备服务地址',
    description: '测试接单大厅的任务卡和领取流程',
  });
  requests.push(extra.id);
  await page.goto('http://localhost:3102/workbench.html');
  await page
    .getByRole('heading', { name: '今日服务工作台', exact: true })
    .waitFor();
  await capture('reference-engineer-workbench');
  await page.goto('http://localhost:3102/opportunities.html');
  await page.locator('[data-claim="' + extra.id + '"]').waitFor();
  await capture('reference-engineer-pool');
  await page.locator('[data-claim="' + extra.id + '"]').click();
  await page.waitForURL('**/platform-order.html?id=' + extra.id);
  await page.locator('[data-action=accept]').waitFor();
  await capture('reference-engineer-detail');
  await page.locator('[data-action=accept]').click();
  await page.getByRole('button', { name: '确认继续', exact: true }).click();
  await page.locator('[data-action=quote]').waitFor();
  await page.locator('[data-action=quote]').click();
  await page.locator('dialog[open] [name=amount]').fill('280.50');
  await page
    .locator('dialog[open] [name=note]')
    .fill('诊断与维修工时，配件按沟通范围确认');
  await page.getByRole('button', { name: '确认提交', exact: true }).click();
  await page
    .locator('.detail-status h2')
    .getByText('待确认报价', { exact: true })
    .waitFor();
  assert.equal(
    (await api('/market/requests/' + extra.id, customer.accessToken))
      .quote_amount,
    '280.50',
  );
  for (const width of [320, 414, 1280]) {
    await page.setViewportSize({ width, height: 896 });
    for (const url of [
      '3101/home.html',
      '3101/services.html',
      '3101/platform-order.html?id=' + extra.id,
      '3102/workbench.html',
      '3102/opportunities.html',
      '3102/platform-order.html?id=' + extra.id,
    ]) {
      await page.goto('http://localhost:' + url);
      await page.locator('.market-heading h1').waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        '横向溢出 ' + width + ' ' + url,
      );
      const nav = await page.locator('.mobile-navigation').boundingBox();
      assert(nav.x >= -1 && nav.x + nav.width <= width + 1, '底栏应在视口内');
    }
  }
  console.log(
    'PASS 六个样板页在 320/414/1280 宽度无横向溢出；底部导航居中；接单确认与报价弹窗实际提交',
  );
  if (process.env.MARKET_SCREENSHOTS === '1')
    await page.screenshot({
      path: path.join(root, '.local-preview/market-engineer-review.png'),
      fullPage: true,
    });
  await page.goto('http://localhost:3102/learning.html');
  await page.locator('[data-enroll]').first().waitFor();
  await page.goto('http://localhost:3102/profile.html');
  await page
    .locator('.workspace-brand strong')
    .getByText('平台合作工程师', { exact: true })
    .waitFor();
  await page.goto('http://localhost:3103/platform-market.html');
  await page.locator('#offerForm').waitFor();
  await page.locator('#courseForm').waitFor();
  const courseForm = page.locator('#courseForm');
  for (const [name, value] of Object.entries({
    title: prefix + '-browser-course',
    city: '测试市',
    centerName: '浏览器测试培训点',
    address: '浏览器测试培训地址',
    startDate: '2026-11-20',
    capacity: '5',
    description: '浏览器课程发布测试说明',
  }))
    await courseForm.locator('[name=' + name + ']').fill(value);
  await courseForm.locator('button').click();
  await page
    .locator('.console-item strong')
    .getByText(prefix + '-browser-course', { exact: true })
    .waitFor();
  const browserCourse = (
    await db.query('SELECT id FROM market.courses WHERE title=$1', [
      prefix + '-browser-course',
    ])
  ).rows[0];
  const toggle = page.locator('[data-publish="' + browserCourse.id + '"]');
  await toggle.click();
  await toggle.getByText('上架', { exact: true }).waitFor();
  assert.equal(
    (
      await db.query('SELECT published FROM market.courses WHERE id=$1', [
        browserCourse.id,
      ])
    ).rows[0].published,
    false,
  );
  await context.addInitScript((company) => {
    if (location.port === '3100') {
      sessionStorage.setItem('cs_admin_token', company.token);
      sessionStorage.setItem(
        'cs_admin_user',
        JSON.stringify({
          id: company.subject_id,
          role: 'cs_operator',
          tenantId: company.id,
          name: '测试企业管理员',
        }),
      );
    }
  }, companies[0]);
  const adminPage = await context.newPage();
  await adminPage.goto('http://localhost:3100/service-network');
  await adminPage
    .getByRole('heading', { name: '售后组织与服务协作', exact: true })
    .waitFor();
  await adminPage
    .getByText(prefix + '-1', { exact: true })
    .first()
    .waitFor();
  await adminPage.close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (process.env.MARKET_SCREENSHOTS === '1')
    await page.screenshot({
      path: path.join(root, '.local-preview/market-platform-review.png'),
      fullPage: true,
    });
  assert.deepEqual(errors, []);
  console.log(
    'PASS 浏览器：客户真实提交需求，工程师工作台/培训/个人身份，平台服务运营页面，无脚本错误',
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  // Remove only records created by this run, including requests made via the browser.
  const ids = people.map((p) => p.id);
  const ownRequests = [
    ...new Set([
      ...requests,
      ...(
        await db.query(
          'SELECT id FROM market.requests WHERE customer_id=ANY($1::uuid[])',
          [ids],
        )
      ).rows.map((r) => r.id),
    ]),
  ];
  await db.query(
    'DELETE FROM market.events WHERE request_id=ANY($1::uuid[]) OR actor_id=ANY($2::uuid[])',
    [ownRequests, ids],
  );
  await db.query(
    'DELETE FROM market.events WHERE request_id IS NULL AND note LIKE $1',
    [prefix + '%'],
  );
  await db.query('DELETE FROM market.requests WHERE id=ANY($1::uuid[])', [
    ownRequests,
  ]);
  await db.query(
    'DELETE FROM market.enrollments WHERE person_id=ANY($1::uuid[])',
    [ids],
  );
  await db.query(
    'DELETE FROM market.qualifications WHERE person_id=ANY($1::uuid[])',
    [ids],
  );
  await db.query(
    'DELETE FROM market.engineers WHERE person_id=ANY($1::uuid[])',
    [ids],
  );
  await db.query('DELETE FROM market.offers WHERE title LIKE $1', [
    prefix + '%',
  ]);
  await db.query('DELETE FROM market.courses WHERE title LIKE $1', [
    prefix + '%',
  ]);
  await db.query(
    'DELETE FROM identity.people WHERE id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM identity.links WHERE person_id=identity.people.id)',
    [ids],
  );
  await db.end();
  console.log('CLEANUP 本次测试数据已清理');
}
