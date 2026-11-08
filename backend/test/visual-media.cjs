const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const response = await fetch('http://localhost:8180/identity/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '13800138000',
      code: '000000',
      role: 'customer',
    }),
  });
  assert(response.ok, '演示账号登录失败');
  const account = await response.json();
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9324');
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 430, height: 930 },
    });
    await context.addInitScript((a) => {
      localStorage.setItem('customer_token', a.accessToken);
      localStorage.setItem('customer_user', JSON.stringify(a.user));
    }, account);
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const name of [
      'hero',
      'device-cutting',
      'device-welding',
      'device-marking',
      'service-repair',
      'service-maintenance',
      'service-installation',
      'service-inspection',
      'service-welding',
    ]) {
      const r = await fetch(
        'http://localhost:3101/media/service-visuals/' + name + '.webp',
      );
      assert(r.ok, name + ' 图片未发布');
      assert(r.headers.get('content-type').includes('image/webp'));
    }
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: 930 });
      for (const file of ['home', 'services', 'devices']) {
        await page.goto('http://localhost:3101/' + file + '.html');
        if (file === 'devices')
          await page.locator('#deviceListSection:not(.hidden)').waitFor();
        else await page.locator('.market-heading').waitFor();
        const pictures = page.locator('.visual-media img,.home-visual>img');
        assert((await pictures.count()) > 0, file + ' 应显示图片');
        for (const img of await pictures.all()) {
          await img.scrollIntoViewIfNeeded();
          await img.evaluate(
            (el) =>
              new Promise((resolve, reject) => {
                if (el.complete)
                  return el.naturalWidth
                    ? resolve()
                    : reject(Error('图片加载失败'));
                el.onload = resolve;
                el.onerror = () => reject(Error('图片加载失败'));
              }),
          );
          assert((await img.getAttribute('alt')).includes('示意'));
        }
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          '页面横向溢出 ' + file + ' ' + width,
        );
        await page.evaluate(() => scrollTo(0, 0));
        if (width === 430 && process.env.VISUAL_SCREENSHOTS === '1')
          await page.screenshot({
            path: path.resolve(
              __dirname,
              '../../.local-preview/visual-' + file + '-review.png',
            ),
            fullPage: file === 'devices',
          });
      }
    }
    assert.deepEqual(
      await page.evaluate(() =>
        ['激光切割机', '激光焊接机', '激光打标机', '未分类设备'].map(
          (deviceType) => window.VisualMedia.deviceKey({ deviceType }),
        ),
      ),
      ['cutting', 'welding', 'marking', null],
    );
    assert.equal(await page.evaluate(()=>new Set(['cutting','welding','marking','maintenance','installation','inspection'].map(c=>{var wrap=document.createElement('div');wrap.innerHTML=window.VisualMedia.service(c);return wrap.querySelector('img').getAttribute('src');})).size),6,'六种服务类别应有不同默认配图');
    await page.goto('http://localhost:3101/services.html');
    await page.locator('.service-cover img[src$="service-welding.webp"]').first().waitFor();
    await page.locator('.service-cover img[src$="service-repair.webp"]').first().waitFor();
    await page.locator('[data-category=maintenance]').click();
    await page
      .locator('.service-cover img[src$="service-maintenance.webp"]')
      .first()
      .waitFor();
    await page.locator('[data-offer]').first().click();
    await page.locator('#requestDialog[open]').waitFor();
    await page
      .getByRole('button', { name: '关闭需求表单', exact: true })
      .click();
    await page.locator('#requestDialog').waitFor({ state: 'hidden' });
    await page.route('**/media/service-visuals/hero.webp', (r) => r.abort());
    await page.goto('http://localhost:3101/home.html');
    await page.locator('.home-visual.media-unavailable').waitFor();
    assert(
      await page.getByRole('link', { name: '寻找售后服务' }).isVisible(),
      '主图失败时仍应能找服务',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS 9 张本地图片；六类配图不同；3 页×3 种宽度；设备类型匹配；服务筛选与需求弹窗；主图失败回退；无脚本错误',
    );
  } finally {
    if (context) await context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
