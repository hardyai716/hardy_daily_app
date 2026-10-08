// Browser regression for v22 backup import/preview/merge/replace. No cloud access.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const target = process.argv[2] || path.join(__dirname, '../candidate/v22/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'restore-results.json');
const html = fs.readFileSync(target);
const source = html.toString('utf8');
const expectedSchemaVersion = Number(source.match(/schemaVersion:(\d+)/)?.[1]);
const expectedAppVersion = Number(source.match(/appVersion:(\d+)/)?.[1]);
const results = {
  method: 'Exact candidate in isolated Chrome; native file chooser and download events',
  target,
  checks: [],
  pageErrors: [],
};
let server;
let browser;

function waitForAnyDownload(context, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const attach = page => page.on('download', download => {
      if (settled) return;
      settled = true;
      resolve(download);
    });
    context.pages().forEach(attach);
    context.on('page', attach);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('download did not start'));
    }, timeout);
  });
}
async function downloadBytes(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function addMoney(page, amount, note) {
  await page.locator('.side-nav [data-nav=money]').click();
  await page.locator('#moneyForm [name=amount]').fill(String(amount));
  await page.locator('#moneyForm [name=note]').fill(note);
  await page.locator('#moneyForm button[type=submit]').click();
}
async function importBuffer(page, buffer, name = 'backup.json') {
  await page.locator('#syncImportFile').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer,
  });
  await page.locator('#restoreBackdrop').waitFor({ state: 'visible' });
}
async function recordNotes(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('richangji-state-v1')).records
      .filter(record => record.type === 'money')
      .map(record => record.data.note)
      .sort()
  );
}
async function expectRejected(page, packet, messagePattern) {
  const before = await page.evaluate(() => localStorage.getItem('richangji-state-v1'));
  await page.locator('#toast').evaluate(node => node.classList.remove('show'));
  await page.locator('#syncImportFile').setInputFiles({
    name: 'invalid-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(packet)),
  });
  await page.locator('#toast.show').waitFor();
  assert.match(await page.locator('#toast').textContent(), messagePattern);
  assert.equal(await page.evaluate(() => localStorage.getItem('richangji-state-v1')), before);
  assert.equal(await page.locator('#restoreBackdrop').isHidden(), true);
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.stack || error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/app`, { waitUntil: 'load' });
  await page.locator('#syncImport').waitFor();
  const errorStages = [];
  const markErrors = label => errorStages.push({ label, errors: [...results.pageErrors] });
  markErrors('initial');

  await addMoney(page, 11, '备份内记录');
  markErrors('after-add');
  let pending = waitForAnyDownload(context);
  await page.locator('#syncExport').click();
  let download = await pending;
  const backup = await downloadBytes(download);
  const packet = JSON.parse(backup.toString('utf8'));
  assert.equal(packet.format, 'richangji-recovery-v22');
  assert.equal(packet.schemaVersion, expectedSchemaVersion);
  assert.equal(packet.appVersion, expectedAppVersion);
  assert.equal(packet.counts.money, 1);
  results.checks.push('v22 backup contains version metadata and record counts');
  markErrors('export');

  await addMoney(page, 22, '当前新增记录');
  await importBuffer(page, backup);
  assert.match(await page.locator('#restoreSummary').textContent(), /记账 1 条/);
  await page.locator('#restoreMerge').click();
  await page.locator('#restoreBackdrop').waitFor({ state: 'hidden' });
  assert.deepEqual(await recordNotes(page), ['备份内记录', '当前新增记录']);
  results.checks.push('merge restore keeps current-only records');
  markErrors('merge');

  await importBuffer(page, backup);
  pending = waitForAnyDownload(context);
  await page.locator('#restoreReplace').click();
  download = await pending;
  assert.match(download.suggestedFilename(), /^日常集-恢复前备份-/);
  await page.locator('#confirmBackdrop').waitFor({ state: 'visible' });
  await page.locator('#confirmOk').click();
  await page.locator('#restoreBackdrop').waitFor({ state: 'hidden' });
  assert.deepEqual(await recordNotes(page), ['备份内记录']);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
  assert.ok(Object.values(stored.sync.queue).some(task =>
    task.kind === 'money' && task.value === null
  ));
  results.checks.push('replace restore downloads a rollback copy and queues current-only deletion');
  markErrors('replace');

  const beforeInvalid = await page.evaluate(() => localStorage.getItem('richangji-state-v1'));
  await page.locator('#syncImportFile').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"unknown","state":{}}'),
  });
  await page.locator('#toast.show').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('richangji-state-v1')), beforeInvalid);
  assert.equal(await page.locator('#restoreBackdrop').isHidden(), true);
  results.checks.push('invalid backup is rejected without mutating local state');
  markErrors('invalid');

  const unsafeId = structuredClone(packet);
  unsafeId.state.records[0].id = 'bad" autofocus onfocus="alert(1)';
  await expectRejected(page, unsafeId, /ID 含有非法字符/);
  results.checks.push('attribute-breaking record IDs are rejected before rendering');

  const filteredAsset = structuredClone(packet);
  filteredAsset.state.assetAccounts = [{
    id: 'asset-invalid',
    name: '',
    nature: 'asset',
    category: '现金',
    balance: 100,
    status: 'active',
    updatedAt: new Date().toISOString(),
  }];
  filteredAsset.state.assetSnapshots = [];
  filteredAsset.state.assetSnapshotItems = [];
  await expectRejected(page, filteredAsset, /资产账户格式无效/);
  results.checks.push('records that normalization would drop are rejected before migration');

  const mismatchedSnapshot = structuredClone(packet);
  mismatchedSnapshot.state.assetAccounts = [{
    id: 'asset-1',
    name: '现金账户',
    nature: 'asset',
    category: '现金',
    balance: 100,
    status: 'active',
    updatedAt: new Date().toISOString(),
  }];
  mismatchedSnapshot.state.assetSnapshots = [{
    id: 'snapshot-1',
    createdAt: new Date().toISOString(),
    totalAssets: 100,
    totalDebt: 0,
    netWorth: 100,
    reason: '测试',
    status: 'complete',
  }];
  mismatchedSnapshot.state.assetSnapshotItems = [{
    id: 'snapshot-item-1',
    snapshotId: 'snapshot-1',
    accountId: 'asset-1',
    accountName: '现金账户',
    nature: 'asset',
    category: '现金',
    balance: 50,
  }];
  await expectRejected(page, mismatchedSnapshot, /汇总金额与账户明细不一致/);
  results.checks.push('complete asset snapshots must reconcile to their item totals');

  results.errorStages = errorStages;
  assert.deepEqual(results.pageErrors, []);
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  results.failure = error.message;
  console.error(JSON.stringify(results, null, 2));
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
