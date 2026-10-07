// Browser regression for v24 money search, date filtering, and incremental rendering.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v24/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'money-explorer-v24-results.json');
const html = fs.readFileSync(target);
const results = { target, checks: [], pageErrors: [] };
let server;
let browser;

function dateAt(index) {
  const date = new Date(2026, 0, 1);
  date.setDate(date.getDate() + index);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const seededState = {
  version: 3,
  records: Array.from({ length: 145 }, (_, index) => ({
    id: `money-${index}`,
    type: 'money',
    date: dateAt(index),
    createdAt: index,
    sample: false,
    data: {
      flow: index % 5 === 0 ? 'income' : 'expense',
      amount: index + 0.5,
      category: index % 2 ? '吃饭' : '交通',
      note: index % 40 === 0 ? `needle-${index}` : `普通账目-${index}`,
    },
  })),
  habits: [],
  archivedHabits: [],
  mediaItems: [],
  drafts: {},
  settings: { weeklyPlan: [] },
};

async function setHiddenDate(page, selector, value) {
  await page.locator(selector).evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

(async () => {
  server = http.createServer((req, res) => {
    if (!req.url.startsWith('/app')) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.stack || error.message));
  await page.addInitScript(payload => {
    localStorage.setItem('richangji-state-v1', JSON.stringify(payload));
  }, seededState);
  await page.goto(`http://127.0.0.1:${server.address().port}/app#money`, { waitUntil: 'load' });

  assert.equal(await page.locator('#moneyList .record-row').count(), 60);
  assert.equal(await page.locator('#moneyResultSummary').textContent(), '找到 145 条 · 已显示 60 条');
  assert.equal(await page.locator('#moneyLoadMore').isVisible(), true);
  results.checks.push('large histories start at 60 rows while reporting the full result count');

  await page.locator('#moneyLoadMore').click();
  assert.equal(await page.locator('#moneyList .record-row').count(), 120);
  assert.equal(await page.locator('#moneyResultSummary').textContent(), '找到 145 条 · 已显示 120 条');
  await page.locator('#moneyLoadMore').click();
  assert.equal(await page.locator('#moneyList .record-row').count(), 145);
  assert.equal(await page.locator('#moneyLoadMore').isHidden(), true);
  results.checks.push('load more reaches every matching record without a hard display cap');

  await page.locator('#moneySearch').fill('needle');
  assert.equal(await page.locator('#moneyList .record-row').count(), 4);
  assert.equal(await page.locator('#moneyResultSummary').textContent(), '找到 4 条 · 已显示 4 条');
  results.checks.push('keyword search matches notes and resets the visible-page limit');

  await page.locator('#moneySearch').fill('');
  await setHiddenDate(page, '#moneyDateFrom', '2026-02-01');
  await setHiddenDate(page, '#moneyDateTo', '2026-02-28');
  assert.equal(await page.locator('#moneyList .record-row').count(), 28);
  assert.equal(await page.locator('#moneyResultSummary').textContent(), '找到 28 条 · 已显示 28 条');
  results.checks.push('inclusive date range returns the expected records');

  await setHiddenDate(page, '#moneyDateFrom', '2026-03-01');
  await setHiddenDate(page, '#moneyDateTo', '2026-02-01');
  assert.match(await page.locator('#moneyList').textContent(), /起始日期不能晚于结束日期/);
  assert.equal(await page.locator('#moneyLoadMore').isHidden(), true);
  results.checks.push('invalid date ranges show a clear validation state');

  await page.locator('[data-action="reset-money-explorer"]').click();
  assert.equal(await page.locator('#moneySearch').inputValue(), '');
  assert.equal(await page.locator('#moneyDateFrom').inputValue(), '');
  assert.equal(await page.locator('#moneyDateTo').inputValue(), '');
  assert.equal(await page.locator('#moneyFilter').inputValue(), 'all');
  assert.equal(await page.locator('#moneyList .record-row').count(), 60);
  results.checks.push('clear filter resets keyword, dates, category, and pagination');

  assert.deepEqual(results.pageErrors, []);
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  results.failure = error.stack || error.message;
  console.error(JSON.stringify(results, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
