// Isolated v32 asset-ledger regression. Uses local Chrome and an in-memory cloud mock.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

const target = process.argv[2] || path.join(__dirname, '../candidate/v32/index.html');
const resultPath = process.argv[3] || path.join(__dirname, 'asset-v32-results.json');
const html = fs.readFileSync(target, 'utf8');
const expectedAppVersion = Number(html.match(/appVersion:(\d+)/)?.[1]);
const results = { target, checks: [], pageErrors: [], cloudOrder: [] };
let browser;
let server;

function waitForDownload(context, timeout = 5000) {
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

async function state(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('richangji-state-v1')));
}

async function addAccount(page, values) {
  await page.locator('[data-action=add-asset]').click();
  const form = page.locator('#assetAccountForm');
  await form.locator('[name=name]').fill(values.name);
  await form.locator('[name=nature]').selectOption(values.nature);
  await form.locator('[name=category]').selectOption(values.category);
  await form.locator('[name=platform]').fill(values.platform || '');
  await form.locator('[name=balance]').fill(String(values.balance));
  await form.locator('[name=note]').fill(values.note || '');
  await form.locator('button[type=submit]').click();
}

async function editAccount(page, name, changes) {
  const row = page.locator('.asset-account').filter({ hasText: name });
  await row.locator('[data-action=edit-asset]').click();
  const form = page.locator('#assetAccountForm');
  for (const [key, value] of Object.entries(changes)) {
    const field = form.locator(`[name=${key}]`);
    if (key === 'nature' || key === 'category') await field.selectOption(String(value));
    else await field.fill(String(value));
  }
  await form.locator('button[type=submit]').click();
}

async function runBrowserChecks() {
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
  const base = `http://127.0.0.1:${server.address().port}/app`;
  await context.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort()
  );
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.stack || error.message));
  await page.addInitScript(() => {
    localStorage.setItem('richangji-state-v1', JSON.stringify({
      version: 5,
      records: [],
      habits: [],
      archivedHabits: [],
      mediaItems: [],
      drafts: {},
      settings: {},
      sync: null,
    }));
  });
  await page.goto(base, { waitUntil: 'load' });
  let stored = await state(page);
  assert.ok([5, 6].includes(stored.version));

  await page.locator('.side-nav [data-nav=tools]').click();
  assert.equal(await page.locator('#view-tools.active').count(), 1);
  assert.ok(await page.locator('#favoriteTools .tool-card').count() >= 1);
  await page.locator('#allTools .tool-card').filter({ hasText: '个人资产总账' })
    .locator('[data-action=open-tool]').click();
  assert.equal(await page.locator('#assetWorkspace').isVisible(), true);
  assert.match(await page.locator('#assetSyncNote').textContent(), /保存在本机和完整备份|资产云同步已配置/);
  results.checks.push('desktop tools entry opens the asset ledger with an explicit storage state');

  await addAccount(page, {
    name: '工资卡',
    nature: 'asset',
    category: '储蓄卡',
    platform: '招商银行',
    balance: 12000,
  });
  stored = await state(page);
  assert.equal(stored.version, 6);
  assert.equal(stored.assetAccounts.length, 1);
  assert.equal(stored.assetSnapshots.length, 1);
  assert.equal(stored.assetSnapshotItems.length, 1);
  assert.equal(stored.assetSnapshots[0].netWorth, 12000);
  results.checks.push('v31 local state opens safely and persists v32 asset collections on first write');

  await addAccount(page, {
    name: '信用卡',
    nature: 'debt',
    category: '信用卡',
    platform: '招商银行',
    balance: 2300,
  });
  stored = await state(page);
  assert.equal(stored.assetSnapshots.length, 2);
  assert.equal(stored.assetSnapshotItems.length, 3);
  assert.equal(stored.assetSnapshots.at(-1).totalAssets, 12000);
  assert.equal(stored.assetSnapshots.at(-1).totalDebt, 2300);
  assert.equal(stored.assetSnapshots.at(-1).netWorth, 9700);
  results.checks.push('new accounts create full snapshots with asset, debt and net-worth totals');

  await editAccount(page, '工资卡', { name: '工资与生活卡', platform: '招行' });
  stored = await state(page);
  assert.equal(stored.assetSnapshots.length, 2);
  assert.equal(stored.assetAccounts.find(item => item.name === '工资与生活卡').platform, '招行');

  await editAccount(page, '工资与生活卡', { balance: 15000 });
  stored = await state(page);
  assert.equal(stored.assetSnapshots.length, 3);
  assert.equal(stored.assetSnapshotItems.length, 5);
  assert.equal(stored.assetSnapshots.at(-1).netWorth, 12700);
  results.checks.push('metadata edits avoid snapshots while balance edits create one full snapshot');

  const accountIds = Object.fromEntries(stored.assetAccounts.map(item => [item.name, item.id]));
  await page.locator('[data-action=batch-assets]').click();
  await page.locator(`#assetBatchForm input[name="${accountIds['工资与生活卡']}"]`).fill('18000');
  await page.locator(`#assetBatchForm input[name="${accountIds['信用卡']}"]`).fill('1800');
  await page.locator('#assetBatchForm button[type=submit]').click();
  stored = await state(page);
  assert.equal(stored.assetSnapshots.length, 4);
  assert.equal(stored.assetSnapshotItems.length, 7);
  assert.equal(stored.assetSnapshots.at(-1).netWorth, 16200);
  assert.equal(await page.locator('#assetTrendChart path').count(), 1);
  assert.equal(await page.locator('#assetTrendChart circle').count(), 4);
  results.checks.push('batch balance update creates one snapshot and renders a non-empty trend');

  const debtRow = page.locator('.asset-account').filter({ hasText: '信用卡' });
  await debtRow.locator('[data-action=toggle-asset-archive]').click();
  await page.locator('#confirmOk').click();
  stored = await state(page);
  assert.equal(stored.assetSnapshots.length, 5);
  assert.equal(stored.assetSnapshotItems.length, 8);
  assert.equal(stored.assetSnapshots.at(-1).netWorth, 18000);
  assert.equal(stored.assetAccounts.find(item => item.name === '信用卡').status, 'archived');
  await page.locator('#assetAccountFilter').selectOption('all');
  assert.match(await page.locator('.asset-account').filter({ hasText: '信用卡' }).textContent(), /已归档/);
  results.checks.push('archiving changes the current ledger and preserves a full historical snapshot');

  let pending = waitForDownload(context);
  await page.locator('#syncExport').click();
  let download = await pending;
  const backup = await downloadBytes(download);
  const packet = JSON.parse(backup.toString('utf8'));
  assert.equal(packet.schemaVersion, 6);
  assert.equal(packet.appVersion, expectedAppVersion);
  assert.equal(packet.state.assetAccounts.length, 2);
  assert.equal(packet.state.assetSnapshots.length, 5);
  assert.equal(packet.state.assetSnapshotItems.length, 8);
  await page.locator('#syncImportFile').setInputFiles({
    name: 'asset-v32-backup.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await page.locator('#restoreBackdrop').waitFor({ state: 'visible' });
  assert.match(await page.locator('#restoreSummary').textContent(), /资产账户 2 个 · 完整快照 5 份/);
  await page.locator('#restoreMerge').click();
  await page.locator('#restoreBackdrop').waitFor({ state: 'hidden' });
  stored = await state(page);
  assert.equal(stored.assetAccounts.length, 2);
  assert.equal(stored.assetSnapshots.length, 5);
  assert.equal(stored.assetSnapshotItems.length, 8);
  results.checks.push('complete backup and merge restore preserve all asset collections without duplication');

  await page.screenshot({
    path: path.join(__dirname, 'asset-v32-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-nav [data-nav=tools]').click();
  await page.locator('#allTools .tool-card').filter({ hasText: '书影音' })
    .locator('[data-action=open-tool]').click();
  assert.equal(await page.locator('#view-media.active').count(), 1);
  await page.locator('.mobile-nav [data-nav=tools]').click();
  await page.locator('#allTools .tool-card').filter({ hasText: '个人资产总账' })
    .locator('[data-action=open-tool]').click();
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mobileTools: !!document.querySelector('.mobile-nav [data-nav=tools]'),
    summaryVisible: document.querySelector('#assetNetWorth')?.offsetParent !== null,
  }));
  assert.equal(geometry.mobileTools, true);
  assert.equal(geometry.summaryVisible, true);
  assert.ok(geometry.scrollWidth <= geometry.viewport + 1, JSON.stringify(geometry));
  await page.screenshot({
    path: path.join(__dirname, 'asset-v32-mobile.png'),
    fullPage: true,
  });
  results.checks.push('mobile tools entry reaches preserved modules and assets fit 390px without overflow');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unwrap(properties) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, Object.values(value)[0]])
  );
}

function fakeCloud() {
  const tables = {};
  const schemas = {};
  const calls = [];
  let serial = 0;
  return {
    tables,
    schemas,
    calls,
    db: {
      async getSchema({ databaseId }) {
        return { properties: schemas[databaseId] || [] };
      },
      async query(params) {
        calls.push({ method: 'query', ...clone(params) });
        let rows = clone(tables[params.databaseId] || []);
        if (params.filter) {
          const field = params.filter.property;
          rows = rows.filter(row => row[field.property] === field.text.equals);
        }
        return { results: rows, hasMore: false };
      },
      async addRecord(params) {
        calls.push({ method: 'add', ...clone(params) });
        const id = `remote-${++serial}`;
        (tables[params.databaseId] ||= []).push({ _id: id, ...unwrap(params.properties) });
        return { id };
      },
      async updateRecord(params) {
        calls.push({ method: 'update', ...clone(params) });
        const row = tables[params.databaseId].find(item => item._id === params.recordId);
        assert.ok(row);
        Object.assign(row, unwrap(params.properties));
        return { id: params.recordId };
      },
      async getRecord(params) {
        return {
          result: clone(
            (tables[params.databaseId] || []).find(item => item._id === params.recordId) || null
          ),
        };
      },
      async deleteRecord() {
        throw new Error('physical deletes are forbidden');
      },
    },
  };
}

function syncEnvironment(configured) {
  const cloud = fakeCloud();
  let source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .find(script => script.includes('Database SDK Integration'))
    .replace(/\r+\n/g, '\n');
  const assetIds = configured
    ? ['asset-accounts', 'asset-snapshots', 'asset-items']
    : ['', '', ''];
  [
    ['DB_ASSET_ACCOUNTS', assetIds[0]],
    ['DB_ASSET_SNAPSHOTS', assetIds[1]],
    ['DB_ASSET_SNAPSHOT_ITEMS', assetIds[2]],
  ].forEach(([name, value]) => {
    source = source.replace(
      new RegExp(`var ${name} = '[^']*';`),
      `var ${name} = '${value}';`
    );
  });
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        textContent: '',
        innerHTML: '',
        hidden: false,
        disabled: false,
        value: '',
        style: {},
        className: '',
        classList: { add() {}, remove() {}, toggle() {} },
        animate() {},
      });
    }
    return nodes.get(id);
  };
  const storage = {};
  const context = vm.createContext({
    URL,
    Date,
    Math,
    Intl,
    JSON,
    Promise,
    Set,
    Map,
    Number,
    String,
    Boolean,
    Object,
    Array,
    RegExp,
    Error,
    crypto: webcrypto,
    console,
    location: 'https://local.test/',
    navigator: { onLine: true },
    window: { __SMART_PAGE__: { database: cloud.db }, addEventListener() {}, confirm: () => true },
    document: {
      hidden: false,
      documentElement: { lang: '', style: { setProperty() {} } },
      getElementById: id => node(id),
      querySelector: () => node('query'),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    localStorage: {
      getItem: key => storage[key] ?? null,
      setItem: (key, value) => { storage[key] = value; },
    },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  const tail = "  startI18n();\n  document.addEventListener('DOMContentLoaded',()=>acquireWorkbenchEditor(init));";
  assert.ok(source.includes(tail));
  const exposed = `
    renderAll=()=>{};renderSyncStatus=()=>{};renderBackupStatus=()=>{};toast=()=>{};
    globalThis.api={
      get state(){return state},
      get runtime(){return syncRuntime},
      get queue(){return syncState().queue},
      get assetReady(){return ASSET_CLOUD_READY},
      SYNC_TABLES,COMMON_FIELDS,EXTRA_FIELDS,prepareSync,saveState,runSync,collectEntities,createAssetSnapshot,
      normalizeState,decode
    };`;
  vm.runInContext(source.replace(tail, exposed), context, { timeout: 3000 });
  const api = context.api;
  api.state.sync = {
    version: 1,
    base: {},
    queue: {},
    conflicts: {},
    lastSync: null,
    initialized: true,
  };
  api.prepareSync();
  api.runtime.ready = false;
  api.runtime.forcePull = false;
  api.runtime.lastFullPullAt = Date.now();
  for (const [kind, id] of Object.entries(api.SYNC_TABLES)) {
    const legacy = {
      money: { 日期: 'date', 分类: 'text', 金额: 'number', 备注: 'text' },
      planner: { 日期: 'date', 内容: 'text', 类型: 'text', 状态: 'text' },
      fitness: { 日期: 'date', 体重: 'number', 体脂率: 'number', 备注: 'text' },
      home: { 物品名称: 'text', 数量: 'number', 预估价格: 'number', 是否已买: 'text', 备注: 'text' },
      media: { 标题: 'text', 类型: 'text', 状态: 'text', 评分: 'number', 短评: 'text' },
      checkin: { 日期: 'date', 习惯: 'text', 数值: 'number', 备注: 'text' },
    }[kind] || {};
    cloud.schemas[id] = Object.entries({
      ...legacy,
      ...api.COMMON_FIELDS,
      ...api.EXTRA_FIELDS[kind],
    }).map(([name, type]) => ({ name, type }));
    cloud.tables[id] ||= [];
  }
  return { api, cloud };
}

async function runCloudChecks() {
  const local = syncEnvironment(false);
  local.api.state.assetAccounts.push({
    id: 'local-only-asset',
    name: '本机账户',
    nature: 'asset',
    category: '现金',
    platform: '',
    note: '',
    balance: 100,
    currency: 'CNY',
    status: 'active',
    sort: 0,
    updatedAt: new Date().toISOString(),
  });
  local.api.createAssetSnapshot('本机快照');
  local.api.state.records.push({
    id: 'money-still-syncs',
    type: 'money',
    date: '2026-10-08',
    createdAt: 1,
    sample: false,
    data: { flow: 'expense', amount: 8, category: '吃饭', note: '八表不受影响' },
  });
  local.api.saveState();
  await local.api.runSync();
  assert.equal(local.api.assetReady, false);
  assert.equal(
    local.cloud.tables[local.api.SYNC_TABLES.money].length,
    1,
    JSON.stringify({ error: local.api.runtime.error, queue: local.api.queue })
  );
  assert.equal(Object.keys(local.api.collectEntities()).some(key => key.startsWith('asset')), false);
  results.checks.push('missing asset table IDs keep assets local and do not block the original tables');

  const synced = syncEnvironment(true);
  assert.equal(synced.api.assetReady, true);
  synced.api.state.assetAccounts.push({
    id: 'account-1',
    name: '云端工资卡',
    nature: 'asset',
    category: '储蓄卡',
    platform: '招行',
    note: '',
    balance: 20000,
    currency: 'CNY',
    status: 'active',
    sort: 0,
    updatedAt: new Date().toISOString(),
  });
  synced.api.createAssetSnapshot('初始快照');
  synced.api.saveState();
  await synced.api.runSync();
  await synced.api.runSync();

  const assetIds = new Set(['asset-accounts', 'asset-snapshots', 'asset-items']);
  results.cloudOrder = synced.cloud.calls
    .filter(call => ['add', 'update'].includes(call.method) && assetIds.has(call.databaseId))
    .map(call => {
      if (call.databaseId === 'asset-items') return 'snapshot-item';
      if (call.databaseId === 'asset-accounts') return 'account';
      return `snapshot-${unwrap(call.properties)['写入状态']}`;
    });
  assert.deepEqual(results.cloudOrder, [
    'snapshot-writing',
    'snapshot-item',
    'account',
    'snapshot-complete',
  ]);
  assert.equal(synced.cloud.tables['asset-snapshots'].length, 1);
  assert.equal(synced.cloud.tables['asset-items'].length, 1);
  assert.equal(synced.cloud.tables['asset-accounts'].length, 1);
  assert.equal(synced.cloud.tables['asset-snapshots'][0]['写入状态'], 'complete');
  const writing = clone(synced.cloud.tables['asset-snapshots'][0]);
  writing['完整数据'] = writing['完整数据'].replace('"status":"complete"', '"status":"writing"');
  writing['写入状态'] = 'writing';
  assert.equal(synced.api.decode('assetSnapshot', writing).value.status, 'writing');
  results.checks.push('configured asset tables write header, items, accounts, then complete the header');
}

(async () => {
  await runBrowserChecks();
  await runCloudChecks();
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
