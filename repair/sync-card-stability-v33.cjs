// Mobile sync-card layout regression. No cloud or production requests.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v33/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'sync-card-v33-results.json');
const html = fs.readFileSync(target);
const results = { target, widths: [], checks: [], pageErrors: [] };
let browser;
let server;

const states = [
  ['记录已同步 · 草稿在本机', '本机缓存约 1.25 MB · 同步正常', '重试同步'],
  ['已存本机 · 正在同步', '本机缓存约 1.25 MB · 正在同步', '正在同步'],
  ['已存本机 · 120 项待同步', '本机缓存约 1.25 MB · 120 项待同步', '重试同步'],
  ['已存本机 · 云端未就绪', '云端请求失败，已保留本机内容，请重试', '重试同步'],
];

(async () => {
  server = http.createServer((request, response) => {
    if (request.url === '/page/page_comm/inject.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end('');
      return;
    }
    if (request.url !== '/') {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'text/html;charset=utf-8');
    response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const width of [320, 375, 390, 414]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on('pageerror', error => results.pageErrors.push(error.stack || error.message));
    await page.goto(base, { waitUntil: 'load' });
    await page.locator('#syncImport').waitFor();
    const measurements = [];
    for (const state of states) {
      measurements.push(await page.evaluate(([summary, detail, retry]) => {
        document.getElementById('syncSummary').textContent = summary;
        document.getElementById('syncDetail').textContent = detail;
        document.getElementById('syncRetry').textContent = retry;
        const card = document.querySelector('.sync-card');
        return {
          height: card.getBoundingClientRect().height,
          nextTop: card.nextElementSibling.offsetTop,
          detailHeight: document.getElementById('syncDetail').getBoundingClientRect().height,
          retryTop: document.getElementById('syncRetry').offsetTop,
          exportTop: document.getElementById('syncExport').offsetTop,
          scrollWidth: document.documentElement.scrollWidth,
        };
      }, state));
    }
    const heights = measurements.map(item => item.height);
    const nextTops = measurements.map(item => item.nextTop);
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 0.5, JSON.stringify(measurements));
    assert.ok(Math.max(...nextTops) - Math.min(...nextTops) <= 0.5, JSON.stringify(measurements));
    assert.ok(measurements.every(item => item.detailHeight === 46));
    assert.ok(measurements.every(item => item.exportTop > item.retryTop));
    assert.ok(measurements.every(item => item.scrollWidth <= width + 1));
    results.widths.push({ width, height: heights[0], nextTop: nextTops[0] });
    if (width === 390) {
      await page.screenshot({
        path: path.join(__dirname, 'sync-card-v33-mobile.png'),
        fullPage: false,
      });
    }
    await page.close();
  }

  results.checks.push('sync card keeps one height across synced, syncing, pending and error states');
  results.checks.push('content below the sync card keeps a stable layout position');
  results.checks.push('status controls use fixed rows without mobile horizontal overflow');
  assert.deepEqual(results.pageErrors, []);
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  results.failure = error.stack || error.message;
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
