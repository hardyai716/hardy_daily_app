// Native download regression for the v19 CSV candidate. No WorkBuddy network access.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '../candidate/v19/index.html'));
const results = {
  method: 'Exact v19 candidate in isolated Chrome; external network blocked',
  checks: [],
  pageErrors: [],
};
let server;
let browser;

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseCsv(buffer) {
  const input = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && input[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const base = `http://127.0.0.1:${server.address().port}/app`;
  await context.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort()
  );
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#syncSummary').filter({ hasText: '已存本机' }).waitFor();

  await page.locator('.side-nav [data-nav=money]').click();
  await page.locator('#moneyForm [name=amount]').fill('12.34');
  await page.locator('#moneyForm [name=note]').fill('=2+3');
  await page.locator('#moneyForm button[type=submit]').click();
  let pending = page.waitForEvent('download');
  await page.locator('[data-action=export-money]').click();
  let download = await pending;
  const moneyBytes = await readDownload(download);
  const moneyRows = parseCsv(moneyBytes);
  assert.equal(download.suggestedFilename(), '记账流水-2026-10-07.csv');
  assert.equal(moneyBytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.deepEqual(moneyRows[0], ['日期', '类型', '分类', '金额', '备注']);
  assert.equal(moneyRows[1][3], '12.34');
  assert.equal(moneyRows[1][4], "'=2+3");
  results.checks.push('money CSV uses UTF-8 BOM, standard rows, and neutralizes formulas');

  await page.locator('.side-nav [data-nav=fitness]').click();
  await page.locator('#fitnessForm [name=weight]').fill('70.5');
  await page.locator('#fitnessForm [name=bodyFat]').fill('20.1');
  await page.locator('#fitnessForm [name=calories]').fill('0');
  await page.locator('#fitnessForm [name=duration]').fill('0');
  await page.locator('#fitnessForm [name=note]').fill('零值导出校验');
  await page.locator('#fitnessForm button[type=submit]').click();
  pending = page.waitForEvent('download');
  await page.locator('[data-action=export-fitness]').click();
  download = await pending;
  const fitnessBytes = await readDownload(download);
  const fitnessRows = parseCsv(fitnessBytes);
  assert.equal(download.suggestedFilename(), '减脂记录-2026-10-07.csv');
  assert.deepEqual(fitnessRows[0], [
    '日期', '体重(kg)', '体脂率(%)', '摄入热量(kcal)', '运动分钟', '备注',
  ]);
  assert.equal(fitnessRows[1][3], '0');
  assert.equal(fitnessRows[1][4], '0');
  results.checks.push('fitness CSV preserves calories=0 and duration=0');

  assert.equal(await page.getByText('导出 CSV', { exact: true }).count(), 2);
  assert.deepEqual(results.pageErrors, []);
  fs.writeFileSync(
    path.join(__dirname, 'export-results.json'),
    JSON.stringify(results, null, 2) + '\n'
  );
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  results.failure = error.message;
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
