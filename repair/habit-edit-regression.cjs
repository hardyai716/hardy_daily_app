const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v31/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'habit-edit-v31-results.json');
const html = fs.readFileSync(target);
const results = { target, checks: [], pageErrors: [] };
let browser;
let server;

async function createHabit(page, values) {
  const form = page.locator('#habitSettingsForm');
  await form.locator('[name=name]').fill(values.name);
  await form.locator('[name=type]').selectOption(values.type);
  if (values.period) await form.locator('[name=period]').selectOption(values.period);
  if (values.target) await form.locator('[name=target]').fill(String(values.target));
  if (values.unit) await form.locator('[name=unit]').fill(values.unit);
  if (values.targetTime) await form.locator('[name=targetTime]').fill(values.targetTime);
  await form.locator('button[type=submit]').click();
}

function habitCard(page, name) {
  return page.locator('.daily-habit').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
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

  await habitCard(page, '喝水').locator('[data-action=edit-habit]').click();
  const edit = page.locator('#habitEditForm');
  assert.equal(await edit.locator('[name=type]').isDisabled(), false);
  assert.match(await page.locator('#habitEditNotice').textContent(), /尚无历史记录/);
  await edit.locator('[name=name]').fill('补水');
  await edit.locator('[name=period]').selectOption('week');
  await edit.locator('[name=type]').selectOption('counter');
  await edit.locator('[name=target]').fill('12');
  await edit.locator('[name=unit]').fill('杯');
  await edit.locator('[name=tone]').selectOption('terracotta');
  await edit.locator('button[type=submit]').click();
  await habitCard(page, '补水').waitFor();
  assert.match(await habitCard(page, '补水').textContent(), /本周目标 12 杯/);
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  const renamed = stored.habits.find(habit => habit.name === '补水');
  assert.equal(renamed.id, 'habit-water');
  assert.equal(renamed.nameCustomized, true);
  assert.equal(renamed.goalVersions.length, 1);
  results.checks.push('a habit without history supports full in-place editing');

  await page.locator('[data-action=open-habit-settings]').click();
  await createHabit(page, {
    name: '一点前睡觉',
    type: 'time',
    targetTime: '01:00',
  });
  await page.locator('[data-action=close-habit-settings]').last().click();
  const timed = habitCard(page, '一点前睡觉');
  await timed.locator('[data-action=habit-time-input]').fill('00:45');
  await timed.locator('[data-action=habit-time-save]').click();
  assert.match(await timed.textContent(), /已记录 · 达标/);

  await timed.locator('[data-action=edit-habit]').click();
  assert.equal(await edit.locator('[name=type]').isDisabled(), true);
  assert.equal(await edit.locator('[name=period]').isDisabled(), true);
  assert.equal(await page.locator('#habitReplaceBtn').isVisible(), true);
  assert.match(await page.locator('#habitEditNotice').textContent(), /已有历史记录/);
  await edit.locator('[name=name]').fill('十二点半前睡觉');
  await edit.locator('[name=targetTime]').fill('00:30');
  await edit.locator('[name=tone]').selectOption('sand');
  await edit.locator('button[type=submit]').click();

  const renamedTimed = habitCard(page, '十二点半前睡觉');
  await renamedTimed.waitFor();
  const cardText = await renamedTimed.textContent();
  assert.match(cardText, /今天 01:00 前/);
  assert.match(cardText, /起改为 00:30 前/);
  assert.match(cardText, /已记录 · 达标/);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  let timeHabit = stored.habits.find(habit => habit.name === '十二点半前睡觉');
  assert.equal(timeHabit.goalVersions.length, 2);
  assert.ok(timeHabit.goalVersions[1].effectiveFrom > new Date().toISOString().slice(0, 10));
  results.checks.push('an existing habit renames immediately while its goal changes next cycle');

  await renamedTimed.locator('[data-action=edit-habit]').click();
  assert.equal(await page.locator('#habitCancelRuleBtn').isVisible(), true);
  await page.locator('#habitEditSettings .settings-sheet').screenshot({
    path: path.join(__dirname, 'habit-edit-v31-desktop.png'),
  });
  await page.locator('#habitCancelRuleBtn').click();
  assert.equal(await page.locator('#habitCancelRuleBtn').isVisible(), false);
  await page.locator('[data-action=close-habit-edit]').last().click();
  assert.doesNotMatch(await renamedTimed.textContent(), /待生效|起改为/);
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  timeHabit = stored.habits.find(habit => habit.name === '十二点半前睡觉');
  assert.equal(timeHabit.goalVersions.length, 1);
  results.checks.push('a pending goal change can be cancelled before it becomes effective');

  const oldId = timeHabit.id;
  await renamedTimed.locator('[data-action=edit-habit]').click();
  await page.locator('#habitReplaceBtn').click();
  assert.equal(await edit.locator('[name=type]').isDisabled(), false);
  assert.match(await page.locator('#habitEditNotice').textContent(), /创建替代习惯/);
  await edit.locator('[name=name]').fill('每周早睡复盘');
  await edit.locator('[name=type]').selectOption('counter');
  await edit.locator('[name=period]').selectOption('week');
  await edit.locator('[name=target]').fill('3');
  await edit.locator('[name=unit]').fill('次');
  await edit.locator('button[type=submit]').click();
  await habitCard(page, '每周早睡复盘').waitFor();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  const replacement = stored.habits.find(habit => habit.name === '每周早睡复盘');
  const archived = stored.archivedHabits.find(habit => habit.id === oldId);
  assert.ok(replacement);
  assert.notEqual(replacement.id, oldId);
  assert.deepEqual(replacement.entries, {});
  assert.equal(replacement.period, 'week');
  assert.equal(replacement.type, 'counter');
  assert.equal(archived.entries[Object.keys(archived.entries)[0]], 1485);
  results.checks.push('structural changes create a new habit and archive the old history');

  await page.setViewportSize({ width: 390, height: 844 });
  await habitCard(page, '每周早睡复盘').locator('[data-action=edit-habit]').click();
  await page.locator('#habitEditSettings .settings-sheet').screenshot({
    path: path.join(__dirname, 'habit-edit-v31-mobile.png'),
  });
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(geometry.scrollWidth <= geometry.viewport + 1, JSON.stringify(geometry));
  results.checks.push('habit edit sheet fits a mobile viewport without horizontal overflow');

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
