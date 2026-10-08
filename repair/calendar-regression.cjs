// Browser regression for v25 local-day rollover and ISO-week plan completion.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v25/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'calendar-v25-results.json');
const html = fs.readFileSync(target);
const results = { target, checks: [], pageErrors: [] };
let server;
let browser;

const seededState = {
  version: 3,
  records: [],
  habits: [],
  archivedHabits: [],
  mediaItems: [],
  drafts: {},
  settings: {
    weeklyPlan: [{
      id: 'weekly-test',
      group: '运动',
      title: '跨周测试',
      note: '旧版完成状态',
      done: true,
    }],
  },
};

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
  await page.addInitScript(({ state, start }) => {
    const NativeDate = Date;
    window.__testNow = new NativeDate(start).getTime();
    class TestDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [window.__testNow]));
      }
      static now() { return window.__testNow; }
    }
    TestDate.parse = NativeDate.parse;
    TestDate.UTC = NativeDate.UTC;
    window.Date = TestDate;
    localStorage.setItem('richangji-state-v1', JSON.stringify(state));
  }, { state: seededState, start: '2027-01-03T23:50:00' });
  await page.goto(`http://127.0.0.1:${server.address().port}/app#fitness`, { waitUntil: 'load' });
  await page.locator('#todayLabel').filter({ hasText: '1 月 3 日' }).waitFor();

  assert.match(await page.locator('#todayLabel').textContent(), /1 月 3 日/);
  assert.equal(await page.locator('#moneyForm [name="date"]').inputValue(), '2027-01-03');
  assert.equal(await page.locator('#weeklyPlan .plan-item').getAttribute('class'), 'plan-item done');
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  assert.equal(stored.settings.weeklyPlan[0].doneByWeek['2026-W53'], true);
  assert.equal('done' in stored.settings.weeklyPlan[0], false);
  results.checks.push('legacy done state migrates to the ISO week active during upgrade');

  await page.locator('[data-nav="planner"]').first().click();
  await page.locator('#plannerForm [name="title"]').fill('跨日保留的草稿');
  assert.equal(await page.locator('#plannerForm [name="date"]').inputValue(), '2027-01-03');

  await page.evaluate(() => {
    window.__testNow = new Date('2027-01-04T00:05:00').getTime();
    window.dispatchEvent(new Event('focus'));
  });
  assert.match(await page.locator('#todayLabel').textContent(), /1 月 4 日/);
  assert.equal(await page.locator('#moneyForm [name="date"]').inputValue(), '2027-01-04');
  assert.equal(await page.locator('#fitnessForm [name="date"]').inputValue(), '2027-01-04');
  assert.equal(await page.locator('#mediaForm [name="date"]').inputValue(), '2027-01-04');
  assert.equal(await page.locator('#plannerForm [name="date"]').inputValue(), '2027-01-03');
  assert.equal(await page.locator('#plannerForm [name="title"]').inputValue(), '跨日保留的草稿');
  results.checks.push('day rollover refreshes labels and blank defaults while preserving a real draft');

  await page.locator('[data-nav="fitness"]').first().click();
  assert.equal(await page.locator('#weeklyPlan .plan-item').getAttribute('class'), 'plan-item ');
  assert.equal(await page.locator('#planProgress').textContent(), '0 / 1 已完成');
  results.checks.push('a new ISO week starts with an incomplete plan');

  await page.locator('#weeklyPlan [data-action="toggle-plan"]').click();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  assert.equal(stored.settings.weeklyPlan[0].doneByWeek['2026-W53'], true);
  assert.equal(stored.settings.weeklyPlan[0].doneByWeek['2027-W01'], true);
  await page.locator('#weeklyPlan [data-action="toggle-plan"]').click();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  assert.equal(stored.settings.weeklyPlan[0].doneByWeek['2026-W53'], true);
  assert.equal(stored.settings.weeklyPlan[0].doneByWeek['2027-W01'], undefined);
  results.checks.push('toggling affects only the current week and preserves prior-week history');

  await page.locator('[data-nav="habits"]').first().click();
  await page.locator('[data-action="open-habit-settings"]').click();
  const habitForm = page.locator('#habitSettingsForm');
  await habitForm.locator('[name="name"]').fill('四点切日测试');
  await habitForm.locator('[name="type"]').selectOption('time');
  await habitForm.locator('[name="targetTime"]').fill('01:00');
  await habitForm.locator('button[type="submit"]').click();
  await page.locator('[data-action="close-habit-settings"]').last().click();
  const timedHabit = page.locator('.daily-habit').filter({
    has: page.getByRole('heading', { name: '四点切日测试', exact: true }),
  });
  await timedHabit.locator('[data-action="habit-time-input"]').fill('00:30');
  await timedHabit.locator('[data-action="habit-time-save"]').click();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  assert.equal(stored.habits.find(item => item.name === '四点切日测试').entries['2027-01-03'], 1470);

  await page.evaluate(() => {
    window.__testNow = new Date('2027-01-04T04:01:00').getTime();
    window.dispatchEvent(new Event('focus'));
  });
  assert.equal(await timedHabit.locator('[data-action="habit-time-input"]').inputValue(), '');
  assert.match(await timedHabit.textContent(), /未记录/);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  assert.equal(stored.habits.find(item => item.name === '四点切日测试').entries['2027-01-04'], undefined);
  results.checks.push('04:00 logical-day rollover clears the stale time entry without copying it forward');

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
