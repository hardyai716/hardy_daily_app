// Smoke test the exact bytes now live on the workbench (local candidate v28 == cloud version 24).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../private_work/verify_v28/index.html'));
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
  const info = await page.evaluate(() => {
    const src = document.documentElement.innerHTML;
    const panel = document.getElementById('syncDiagnosticsPanel');
    return {
      bindings: ['DB_MONEY', 'DB_FITNESS', 'DB_MEDIA', 'DB_HABIT', 'DB_PLAN', 'DB_SHOPPING', 'DB_HABIT_DEFS', 'DB_SETTINGS']
        .map(k => { const m = src.match(new RegExp("var " + k + " = '([^']+)'")); return k + "=" + (m ? m[1] : 'EMPTY'); }),
      mainStatus: (document.getElementById('syncSummary') || {}).textContent || '',
      detailStatus: (document.getElementById('syncDetail') || {}).textContent || '',
      diagnosticsExists: Boolean(panel),
      diagnosticsOpenAttr: panel ? panel.hasAttribute('open') : null,
      diagnosticsText: (document.getElementById('syncDiagnosticsText') || {}).textContent || '',
      appVersionInBackup: /appVersion:\s*28/.test(src),
      legacy: {
        editRecord: /edit-record/.test(src),
        moneySearch: /reset-money-explorer|money-search/.test(src),
        loadMore: /load-more-money|moneyLoadMore/.test(src),
        restore: /rejectUnsafeBackupKeys/.test(src),
      },
    };
  });
  await browser.close(); server.close();
  console.log(JSON.stringify({ views: views.length, ...info, pageErrors: errors }, null, 1));
  assert.deepEqual(errors, []);
  assert.ok(info.bindings.every(b => !b.endsWith('EMPTY')), '存在空表绑定');
  assert.ok(/本机缓存约 .+ · .+/.test(info.detailStatus), '本机缓存文案缺失: ' + info.detailStatus);
  assert.ok(!/删除标记/.test(info.mainStatus), '主状态仍含删除标记');
  assert.ok(info.diagnosticsExists, '诊断详情面板缺失');
  assert.ok(info.diagnosticsOpenAttr === false, '诊断详情不是默认折叠');
  assert.ok(/删除标记/.test(info.diagnosticsText) && /无需处理/.test(info.diagnosticsText), '诊断详情缺少删除标记/无需处理说明');
  assert.ok(info.appVersionInBackup, '备份 appVersion 未更新到 28');
  assert.ok(Object.values(info.legacy).every(Boolean), '原有功能标记缺失: ' + JSON.stringify(info.legacy));
  console.log('SMOKE PASS');
})().catch(e => { console.error('SMOKE FAIL', e.message); process.exit(1); });
