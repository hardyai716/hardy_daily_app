// Smoke test the exact bytes now live on the workbench (local candidate v27 == cloud v23).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../private_work/verify_v27b/index.html'));
(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/app')) { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(html); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/app`;
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#syncSummary').filter({ hasText: '已存本机' }).waitFor();
  const views = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const key of ['dashboard', 'money', 'habits', 'fitness', 'planner', 'home', 'media', 'archive']) {
      const nav = page.locator((width === 390 ? '.mobile-nav' : '.side-nav') + ' [data-nav="' + key + '"]');
      if (await nav.count()) await nav.click();
      else {
        await page.locator('.mobile-nav [data-nav=dashboard]').click();
        await page.locator('#view-dashboard ' + (key === 'archive' ? '[data-nav=archive]' : '[data-quick="' + key + '"]')).click();
      }
      await page.locator('#view-' + key + '.active').waitFor();
      const g = await page.evaluate(() => ({ view: document.querySelector('.view.active').id, scroll: document.documentElement.scrollWidth, w: innerWidth }));
      assert.ok(g.scroll <= width + 1, `${key}@${width} 横向溢出`);
      views.push(`${width}:${g.view}`);
    }
  }
  const bindings = await page.evaluate(() => {
    const src = document.documentElement.innerHTML;
    return ['DB_MONEY', 'DB_FITNESS', 'DB_MEDIA', 'DB_HABIT', 'DB_PLAN', 'DB_SHOPPING', 'DB_HABIT_DEFS', 'DB_SETTINGS']
      .map(k => { const m = src.match(new RegExp("var " + k + " = '([^']+)'")); return k + "=" + (m ? m[1] : 'EMPTY'); });
  });
  const features = await page.evaluate(() => {
    const src = document.documentElement.innerHTML;
    return {
      moneySearch: /moneySearch/.test(src),
      editRecord: /edit-record/.test(src),
      restoreBackup: /rejectUnsafeBackupKeys/.test(src),
      backgroundPull: /scheduleBackgroundPull/.test(src),
    };
  });
  await browser.close(); server.close();
  console.log(JSON.stringify({ views: views.length, bindings, features, pageErrors: errors }, null, 1));
  assert.deepEqual(errors, []);
  assert.ok(bindings.every(b => !b.endsWith('EMPTY')), '存在空表绑定');
  assert.ok(features.moneySearch && features.editRecord && features.restoreBackup && features.backgroundPull, '缺少 v27 功能标记');
  console.log('SMOKE PASS');
})().catch(e => { console.error('SMOKE FAIL', e.message); process.exit(1); });
