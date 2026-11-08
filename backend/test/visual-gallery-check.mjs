import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export async function checkVisualGalleries({
  context,
  api,
  control,
  root,
  customer,
  engineer,
  foreign,
  tenants,
  device,
  repairId,
  platformToken,
  services,
}) {
  const photo = await fs.readFile(
      path.join(
        root,
        'apps/customer-app-web/media/service-visuals/part-lens.webp',
      ),
    ),
    courseId = randomUUID();
  async function upload(kind, id, slot, token, expected = 201) {
    const body = new FormData();
    body.append('kind', kind);
    body.append('id', id);
    body.append('slot', slot);
    body.append(
      'photo',
      new Blob([photo], { type: 'image/webp' }),
      'test.webp',
    );
    const r = await fetch('http://localhost:8180/market/visual', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body,
    });
    const data = await r.json();
    assert(
      expected === 201 ? r.ok : r.status === expected,
      kind + ' ' + r.status + ' ' + JSON.stringify(data),
    );
    return data;
  }
  try {
    await upload('device', device.id, 'nameplate', customer.accessToken);
    await upload('device', device.id, 'component', customer.accessToken);
    await upload('device', device.id, 'overview', customer.accessToken);
    await upload('device', device.id, 'nameplate', foreign.accessToken, 404);
    await upload('device', device.id, 'overview', tenants[1].token, 404);
    await upload('company', tenants[0].id, 'team', tenants[0].token);
    await upload('company', tenants[0].id, 'workshop', tenants[0].token);
    await upload('company', tenants[0].id, 'team', tenants[1].token, 403);
    const company = await api(
      '/market/visual/company/' + device.serviceId,
      customer.accessToken,
    );
    assert.equal(company.id, tenants[0].id);
    assert(!JSON.stringify(company).includes('database_name'));
    await control.query(
      "INSERT INTO market.engineers(person_id,mode,cities,introduction,state) VALUES($1,'ORG','[\"测试市\"]','测试工程师服务资料','APPROVED')",
      [engineer.user.id],
    );
    await control.query(
      "INSERT INTO market.qualifications(id,person_id,skill,expires_at,source) VALUES($1,$2,'welding',now()+interval '1 year','测试夹具')",
      [randomUUID(), engineer.user.id],
    );
    await upload(
      'engineer',
      engineer.user.id,
      'portrait',
      engineer.accessToken,
    );
    await upload('engineer', engineer.user.id, 'skill', engineer.accessToken);
    const publicEngineer = await api(
      '/market/visual/engineer/' + engineer.user.id,
      customer.accessToken,
    );
    assert.equal(publicEngineer.employers.length, 2);
    assert(!JSON.stringify(publicEngineer).includes('phone'));
    await upload('request', repairId, 'AFTER', customer.accessToken, 403);
    const service = services.find((s) => s.name === tenants[0].name);
    await api(
      '/market/requests/' + repairId + '/action',
      engineer.accessToken,
      { action: 'claim', version: 1, serviceId: service.id },
    );
    await api(
      '/market/requests/' + repairId + '/action',
      engineer.accessToken,
      { action: 'accept', version: 2 },
    );
    await upload('request', repairId, 'DIAGNOSIS', engineer.accessToken);
    await upload('request', repairId, 'AFTER', engineer.accessToken, 403);
    await api(
      '/market/requests/' + repairId + '/action',
      engineer.accessToken,
      { action: 'quote', version: 3, amount: 100, note: '测试诊断与维修报价' },
    );
    await api(
      '/market/requests/' + repairId + '/action',
      customer.accessToken,
      { action: 'approve', version: 4 },
    );
    await api(
      '/market/requests/' + repairId + '/action',
      engineer.accessToken,
      { action: 'start', version: 5 },
    );
    const after = await upload(
      'request',
      repairId,
      'AFTER',
      engineer.accessToken,
    );
    const phases = await api(
      '/market/visual?kind=request&id=' + repairId,
      customer.accessToken,
    );
    assert.deepEqual(
      new Set(phases.items.map((i) => i.slot)),
      new Set(['REPORTED', 'DIAGNOSIS', 'AFTER']),
    );
    const inaccessible = await fetch(
      'http://localhost:8180/market/visual/' + after.id + '/content',
      { headers: { Authorization: 'Bearer ' + foreign.accessToken } },
    );
    assert.equal(inaccessible.status, 404);
    const part = await api('/parts', tenants[0].token, {
      name: '测试保护镜片',
      code: 'VISUAL-' + Date.now(),
      category: '镜片',
      unit: '片',
      guidePrice: 50,
      costPrice: 20,
    });
    for (const slot of ['product', 'packaging', 'label'])
      await upload('part', part.id, slot, tenants[0].token);
    await api(
      '/operations/mobile?serviceId=' + service.id,
      engineer.accessToken,
    );
    const source = tenants[0].source,
      warehouse = await source
        .getRepository('Warehouse')
        .findOneBy({ ownerEngineerId: tenants[0].engineer.id });
    assert(warehouse);
    await source.getRepository('PartsInventory').save({
      warehouseId: warehouse.id,
      partId: part.id,
      quantity: 3,
      reservedQuantity: 0,
    });
    await control.query(
      "INSERT INTO market.courses(id,title,skill,city,center_name,address,start_date,capacity,published) VALUES($1,'测试图集课程','welding','测试市','测试实训中心','测试课程地址','2026-12-20',10,true)",
      [courseId],
    );
    for (const slot of ['cover', 'venue', 'practice'])
      await upload('course', courseId, slot, platformToken);
    await upload('course', courseId, 'cover', customer.accessToken, 403);
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [url, selector] of [
        [
          '3101/device-detail.html?id=' + device.id,
          '#deviceVisuals[data-loaded]',
        ],
        [
          '3101/company.html?id=' + device.serviceId,
          '#companyVisuals[data-loaded]',
        ],
        [
          '3101/engineer-info.html?id=' + engineer.user.id,
          '#engineerPublicVisuals[data-loaded]',
        ],
        [
          '3101/platform-order.html?id=' + repairId,
          '#stageVisuals[data-loaded]',
        ],
        ['3102/learning.html', '[data-course-thumb]'],
        ['3102/profile.html', '#ownEngineerVisuals[data-loaded]'],
        ['3102/inventory.html', '[data-part-thumb]'],
      ]) {
        await page.goto('http://localhost:' + url);
        if (url === '3102/profile.html') {
          await page.locator('.field-photo-settings > summary').click();
        }
        await page.locator(selector).first().waitFor();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          '图集页面溢出 ' + width + ' ' + url,
        );
        if (width === 430 && process.env.VISUAL_GALLERY_SCREENSHOTS === '1')
          await page.screenshot({
            path: path.join(
              root,
              '.local-preview/gallery-' +
                url.split('/')[1].split('.')[0] +
                '-review.png',
            ),
            fullPage: true,
          });
      }
    }
    await page.goto('http://localhost:3101/device-detail.html?id=' + device.id);
    await page.locator('#deviceVisuals[data-loaded]').waitFor();
    const count = (
      await api(
        '/market/visual?kind=device&id=' + device.id,
        customer.accessToken,
      )
    ).items.length;
    await page.getByLabel('上传设备铭牌', { exact: true }).setInputFiles({
      name: 'browser-nameplate.webp',
      mimeType: 'image/webp',
      buffer: photo,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('#deviceVisuals .vg-item').length === 4,
    );
    assert.equal(
      (
        await api(
          '/market/visual?kind=device&id=' + device.id,
          customer.accessToken,
        )
      ).items.length,
      count + 1,
    );
    await page.locator('#deviceVisuals .vg-item button').first().click();
    await page.locator('.vg-lightbox[open]').waitFor();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.reload();
    await page.locator('#deviceVisuals[data-loaded]').waitFor();
    assert.equal(await page.locator('#deviceVisuals .vg-item').count(), 4);
    await page
      .getByRole('button', { name: '移除设备铭牌照片', exact: true })
      .last()
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('#deviceVisuals .vg-item').length === 3,
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      'PASS 六类图片保存与跨端读取；设备/企业权限隔离；工单照片阶段限制；课程与配件资料；真实浏览器上传/刷新/放大/移除；三种宽度',
    );
  } finally {
    const media = (
      await control.query(
        "DELETE FROM market.visuals WHERE kind='course' AND entity_id=$1 RETURNING id",
        [courseId],
      )
    ).rows;
    for (const item of media)
      await fs
        .unlink(
          path.join(root, 'backend/private-market-media', item.id + '.webp'),
        )
        .catch(() => {});
    await control.query('DELETE FROM market.courses WHERE id=$1', [courseId]);
  }
}
