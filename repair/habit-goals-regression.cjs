const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v30/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'habit-goals-v30-results.json');
const html = fs.readFileSync(target);
const results = { target, checks: [], pageErrors: [] };
let browser;
let server;

async function createHabit(page, values) {
  const form = page.locator('#habitSettingsForm');
  await form.locator('[name=name]').fill(values.name);
  if (values.type) await form.locator('[name=type]').selectOption(values.type);
  if (values.period) await form.locator('[name=period]').selectOption(values.period);
  if (values.target) await form.locator('[name=target]').fill(String(values.target));
  if (values.unit) await form.locator('[name=unit]').fill(values.unit);
  if (values.targetTime) await form.locator('[name=targetTime]').fill(values.targetTime);
  await form.locator('button[type=submit]').click();
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
  const base = `http://127.0.0.1:${server.address().port}/app`;
  await context.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort()
  );
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.stack || error.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('.side-nav [data-nav=habits]').click();
  await page.locator('[data-action=open-habit-settings]').click();

  await createHabit(page, {
    name: '游泳',
    type: 'check',
    period: 'week',
    target: 3,
    unit: '次',
  });
  await createHabit(page, {
    name: '本月阅读',
    type: 'number',
    period: 'month',
    target: 100,
    unit: '页',
  });
  await createHabit(page, {
    name: '一点前睡觉',
    type: 'time',
    targetTime: '01:00',
  });
  await page.locator('[data-action=close-habit-settings]').last().click();

  const weekly = page.locator('.daily-habit').filter({ has: page.getByRole('heading', { name: '游泳', exact: true }) });
  const monthly = page.locator('.daily-habit').filter({ has: page.getByRole('heading', { name: '本月阅读', exact: true }) });
  const timed = page.locator('.daily-habit').filter({ has: page.getByRole('heading', { name: '一点前睡觉', exact: true }) });
  await weekly.waitFor();
  assert.match(await weekly.textContent(), /本周目标 3 次/);
  assert.match(await monthly.textContent(), /本月目标 100 页/);
  assert.match(await timed.textContent(), /今天 01:00 前/);
  assert.match(await timed.textContent(), /实际时间/);
  assert.match(await timed.textContent(), /未记录/);
  assert.equal(await timed.locator('[data-action=habit-time-input]').inputValue(), '');
  assert.equal(await timed.locator('[data-action=habit-time-save]').isDisabled(), true);
  results.checks.push('create form supports weekly, monthly, and before-time goals');

  await weekly.locator('[data-action=habit-toggle]').click();
  assert.match(await weekly.textContent(), /1 \/ 3 次/);
  assert.match(await weekly.textContent(), /进行中/);
  results.checks.push('weekly check-in records one daily occurrence and shows 1 / 3 progress');

  await monthly.locator('[data-action=habit-number]').fill('30');
  await monthly.locator('[data-action=habit-number]').press('Tab');
  assert.match(await monthly.textContent(), /30 \/ 100 页/);
  results.checks.push('monthly numeric goal aggregates the entered daily value');

  await timed.locator('[data-action=habit-time-input]').fill('00:30');
  assert.equal(await timed.locator('[data-action=habit-time-save]').isDisabled(), false);
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  let timeHabit = stored.habits.find(habit => habit.name === '一点前睡觉');
  assert.deepEqual(timeHabit.entries, {});
  await timed.locator('[data-action=habit-time-save]').click();
  assert.match(await timed.textContent(), /已记录 · 达标/);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  timeHabit = stored.habits.find(habit => habit.name === '一点前睡觉');
  assert.equal(timeHabit.period, 'day');
  assert.equal(timeHabit.rule, 'beforeTime');
  assert.equal(timeHabit.targetTime, '01:00');
  assert.equal(Object.values(timeHabit.entries).at(-1), 1470);

  await timed.locator('[data-action=habit-time-input]').fill('01:30');
  await timed.locator('[data-action=habit-time-save]').click();
  assert.match(await timed.textContent(), /已记录 · 未达标/);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  timeHabit = stored.habits.find(habit => habit.name === '一点前睡觉');
  assert.equal(Object.values(timeHabit.entries).at(-1), 1530);
  results.checks.push('time selection only persists after the explicit record button');
  results.checks.push('00:30 meets a 01:00 goal while 01:30 is retained as not met');

  await page.waitForTimeout(1100);
  await timed.screenshot({ path: path.join(__dirname, 'habit-goals-v30-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await timed.scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(geometry.scrollWidth <= geometry.viewport + 1, JSON.stringify(geometry));
  await timed.screenshot({ path: path.join(__dirname, 'habit-goals-v30-mobile.png') });
  results.checks.push('habit goal groups fit desktop and mobile without page overflow');

  await timed.locator('[data-action=habit-time-clear]').click();
  assert.match(await timed.textContent(), /未记录/);
  assert.equal(await timed.locator('[data-action=habit-time-input]').inputValue(), '');
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  timeHabit = stored.habits.find(habit => habit.name === '一点前睡觉');
  assert.deepEqual(timeHabit.entries, {});
  results.checks.push('clearing removes the logical-day entry and restores the empty state');

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
