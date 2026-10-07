// Browser regression for v23 in-place record editing. No cloud access.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v23/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'edit-v23-results.json');
const html = fs.readFileSync(target);
const results = { target, checks: [], pageErrors: [] };
let server;
let browser;
let currentStage = 'startup';

const state = page => page.evaluate(() =>
  JSON.parse(localStorage.getItem('richangji-state-v1'))
);
const records = async (page, type) => (await state(page)).records.filter(record => record.type === type);
const edit = async (page, selector, id) => {
  const row = page.locator(selector).filter({ has: page.locator(`[data-action="edit-record"][data-id="${id}"]`) });
  await row.hover();
  await row.locator(`[data-action="edit-record"][data-id="${id}"]`).click();
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
  page.on('pageerror', error => results.pageErrors.push({
    stage: currentStage, message: error.message, stack: error.stack || '',
  }));
  await page.goto(`http://127.0.0.1:${server.address().port}/app`, { waitUntil: 'load' });

  currentStage = 'money';
  await page.locator('[data-nav="money"]').first().click();
  await page.locator('#moneyForm [name="amount"]').fill('12');
  await page.locator('#moneyForm [name="note"]').fill('原账目');
  await page.locator('#moneyForm button[type="submit"]').click();
  let money = (await records(page, 'money'))[0];
  const moneyId = money.id;

  await page.locator('#moneyForm [name="amount"]').fill('9');
  await page.locator('#moneyForm [name="note"]').fill('待新增草稿');
  await edit(page, '.record-row', moneyId);
  await page.locator('#moneyForm [name="amount"]').fill('88');
  await page.locator('#moneyForm [name="note"]').fill('不应保存');
  await page.locator('#moneyForm [data-action="cancel-record-edit"]').click();
  assert.equal(await page.locator('#moneyForm [name="amount"]').inputValue(), '9');
  assert.equal(await page.locator('#moneyForm [name="note"]').inputValue(), '待新增草稿');
  money = (await records(page, 'money'))[0];
  assert.equal(money.data.amount, 12);
  assert.equal(money.data.note, '原账目');
  assert.equal((await state(page)).drafts.moneyForm.note, '待新增草稿');
  results.checks.push('cancel restores the pre-edit new-record draft without changing the record');

  await edit(page, '.record-row', moneyId);
  await page.locator('#moneyForm [name="amount"]').fill('88.5');
  await page.locator('#moneyForm [name="note"]').fill('已改账目');
  await page.locator('#moneyForm button[type="submit"]').click();
  money = (await records(page, 'money'))[0];
  assert.equal(money.id, moneyId);
  assert.equal(money.data.amount, 88.5);
  assert.equal(money.data.note, '已改账目');
  assert.equal((await state(page)).records.filter(record => record.type === 'money').length, 1);
  results.checks.push('money edit updates the original stable ID instead of adding a record');

  currentStage = 'planner';
  await page.locator('[data-nav="planner"]').first().click();
  await page.locator('#plannerForm [name="title"]').fill('原日程');
  await page.locator('#plannerForm [name="time"]').fill('09:30');
  await page.locator('#plannerForm button[type="submit"]').click();
  let planner = (await records(page, 'planner'))[0];
  await page.locator(`#plannerList [data-action="toggle-task"][data-id="${planner.id}"]`).click();
  await edit(page, '#plannerList .task-row', planner.id);
  await page.locator('#plannerForm [name="title"]').fill('更新日程');
  await page.locator('#plannerForm [name="time"]').fill('');
  await page.locator('#plannerForm [name="remind"]').check();
  await page.locator('#plannerForm button[type="submit"]').click();
  planner = (await records(page, 'planner'))[0];
  assert.equal(planner.data.title, '更新日程');
  assert.equal(planner.data.time, '');
  assert.equal(planner.data.remind, true);
  assert.equal(planner.data.done, true);
  results.checks.push('planner edit preserves completion while allowing time clearing');

  currentStage = 'fitness';
  await page.locator('[data-nav="fitness"]').first().click();
  await page.locator('#fitnessForm [name="weight"]').fill('61.2');
  await page.locator('#fitnessForm [name="bodyFat"]').fill('28.4');
  await page.locator('#fitnessForm [name="calories"]').fill('1700');
  await page.locator('#fitnessForm [name="duration"]').fill('30');
  await page.locator('#fitnessForm button[type="submit"]').click();
  let fitness = (await records(page, 'fitness'))[0];
  await edit(page, '.record-row', fitness.id);
  await page.locator('#fitnessForm [name="weight"]').fill('60.8');
  await page.locator('#fitnessForm [name="bodyFat"]').fill('');
  await page.locator('#fitnessForm [name="calories"]').fill('');
  await page.locator('#fitnessForm [name="duration"]').fill('0');
  await page.locator('#fitnessForm button[type="submit"]').click();
  fitness = (await records(page, 'fitness'))[0];
  assert.equal(fitness.data.weight, 60.8);
  assert.equal(fitness.data.bodyFat, null);
  assert.equal(fitness.data.calories, null);
  assert.equal(fitness.data.duration, 0);
  results.checks.push('fitness edit preserves numeric zero and clears optional numbers to null');

  currentStage = 'shopping';
  await page.locator('.side-nav [data-nav="home"]').click();
  await page.locator('#homeForm [name="name"]').fill('原物品');
  await page.locator('#homeForm [name="quantity"]').fill('2 盒');
  await page.locator('#homeForm [name="price"]').fill('20');
  await page.locator('#homeForm button[type="submit"]').click();
  let home = (await records(page, 'home'))[0];
  await page.locator(`[data-action="toggle-shopping"][data-id="${home.id}"]`).click();
  await page.locator('[data-shopping-filter="all"]').click();
  await edit(page, '.shopping-row', home.id);
  await page.locator('#homeForm [name="name"]').fill('更新物品');
  await page.locator('#homeForm [name="quantity"]').fill('');
  await page.locator('#homeForm [name="price"]').fill('');
  await page.locator('#homeForm button[type="submit"]').click();
  home = (await records(page, 'home'))[0];
  assert.equal(home.data.name, '更新物品');
  assert.equal(home.data.quantity, '');
  assert.equal(home.data.price, 0);
  assert.equal(home.data.bought, true);
  assert.match(home.data.boughtDate, /^\d{4}-\d{2}-\d{2}$/);
  results.checks.push('shopping edit preserves purchased state and clears optional values');

  currentStage = 'media';
  await page.locator('[data-nav="media"]').first().click();
  await page.locator('#mediaForm [name="name"]').fill('原作品');
  await page.locator('#mediaForm [name="status"]').selectOption({ label: '看完' });
  await page.locator('#mediaForm [name="rating"]').selectOption('5');
  const pixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0sAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('#mediaCoverInput').setInputFiles({
    name: 'cover.png', mimeType: 'image/png', buffer: pixelPng,
  });
  await page.locator('.cover-upload.has-cover').waitFor();
  await page.locator('#mediaForm button[type="submit"]').click();
  let media = (await state(page)).mediaItems[0];
  assert.match(media.cover, /^data:image\/jpeg;base64,/);
  const mediaId = media.id;
  await edit(page, '.media-card', mediaId);
  await page.locator('#mediaForm [name="name"]').fill('更新作品');
  await page.locator('#mediaForm [name="status"]').selectOption({ label: '弃了' });
  await page.locator('#mediaForm [data-action="remove-edit-cover"]').click();
  await page.locator('#mediaForm button[type="submit"]').click();
  media = (await state(page)).mediaItems[0];
  assert.equal(media.id, mediaId);
  assert.equal(media.name, '更新作品');
  assert.equal(media.status, '弃了');
  assert.equal(media.cover, '');
  assert.equal((await state(page)).mediaItems.length, 1);
  results.checks.push('media edit updates the original item and supports cover removal');

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
