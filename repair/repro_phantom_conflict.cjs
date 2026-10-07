// Reproduce the 33 phantom money conflicts and prove the v18 self-heal clears them.
// Usage: node repro_phantom_conflict.cjs [path-to-html]
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const target = process.argv[2] || (__dirname + '/../candidate/v15/index.html');
const html = fs.readFileSync(target, 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const source = scripts.find(s => s.includes('Database SDK Integration')).replace(/\r+\n/g, '\n');
const clone = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const N = 40, CONFLICTED = 33;
const IDS = { money: 'db-money', planner: 'db-planner', fitness: 'db-fitness', home: 'db-home', media: 'db-media', habit: 'db-habit', checkin: 'db-checkin', settings: 'db-settings' };
const SCHEMAS = {
  money: { properties: [{ name: '日期', type: 'date' }, { name: '分类', type: 'text' }, { name: '金额', type: 'number' }, { name: '备注', type: 'text' }, { name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '收支方向', type: 'text' }] },
  checkin: { properties: [{ name: '日期', type: 'date' }, { name: '习惯', type: 'text' }, { name: '数值', type: 'number' }, { name: '备注', type: 'text' }, { name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '习惯ID', type: 'text' }] },
  habit: { properties: [{ name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '名称', type: 'text' }, { name: '类型', type: 'text' }, { name: '目标', type: 'number' }, { name: '单位', type: 'text' }, { name: '主题色', type: 'text' }, { name: '已归档', type: 'checkbox' }] },
  planner: { properties: [{ name: '日期', type: 'date' }, { name: '内容', type: 'text' }, { name: '类型', type: 'text' }, { name: '状态', type: 'text' }, { name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '时间', type: 'text' }, { name: '优先级', type: 'text' }, { name: '备注', type: 'text' }, { name: '提醒设置', type: 'checkbox' }] },
  fitness: { properties: [{ name: '日期', type: 'date' }, { name: '体重', type: 'number' }, { name: '体脂率', type: 'number' }, { name: '备注', type: 'text' }, { name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '摄入热量', type: 'number' }, { name: '运动分钟', type: 'number' }] },
  home: { properties: [{ name: '物品名称', type: 'text' }, { name: '数量', type: 'number' }, { name: '预估价格', type: 'number' }, { name: '是否已买', type: 'text' }, { name: '备注', type: 'text' }, { name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '记录日期', type: 'date' }, { name: '数量描述', type: 'text' }, { name: '分类', type: 'text' }, { name: '优先级', type: 'text' }, { name: '购入日期', type: 'date' }] },
  media: { properties: [{ name: '标题', type: 'text' }, { name: '类型', type: 'text' }, { name: '状态', type: 'text' }, { name: '评分', type: 'number' }, { name: '短评', type: 'text' }, { name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '记录日期', type: 'date' }, { name: '封面内容', type: 'text' }, { name: '观看状态', type: 'text' }] },
  settings: { properties: [{ name: '稳定ID', type: 'text' }, { name: '变更ID', type: 'text' }, { name: '完整数据', type: 'text' }, { name: '已删除', type: 'checkbox' }, { name: '设置项', type: 'text' }, { name: '设置内容', type: 'text' }] },
};

// Money rows already carry a complete payload and a change id - exactly the live state.
function buildCloud() {
  const money = [];
  for (let i = 0; i < N; i++) {
    const id = 'money-' + i;
    const value = { id, type: 'money', date: '2026-10-0' + (i % 7 + 1), createdAt: 0, data: { flow: i % 5 === 0 ? 'income' : 'expense', amount: 10 + i, category: '餐饮美食', note: '商户 ' + i } };
    money.push({ _id: id, '稳定ID': id, '变更ID': 'cloud-rev-' + i, '完整数据': JSON.stringify(value), '已删除': false,
      '日期': value.date, '分类': '餐饮美食', '金额': value.data.flow === 'income' ? value.data.amount : -value.data.amount,
      '备注': (value.data.flow === 'income' ? '收入：' : '') + value.data.note, '收支方向': value.data.flow });
  }
  return { 'db-money': money, 'db-checkin': [], 'db-habit': [], 'db-planner': [], 'db-fitness': [], 'db-home': [], 'db-media': [], 'db-settings': [] };
}

function localState() {
  const rows = buildCloud()['db-money'];
  return {
    version: 2,
    records: rows.map(r => { const v = JSON.parse(r['完整数据']); return { id: v.id, type: 'money', date: v.date, createdAt: 0, sample: false, remoteId: r._id, data: v.data }; }),
    habits: [], mediaItems: [], drafts: {},
    settings: { budget: 5000, recordsSinceExport: 0, moneySinceExport: 0, lastExportAt: null, archiveFilter: 'all', moneyFilter: 'all', plannerFilter: 'all', shoppingFilter: 'pending', mediaView: 'wall', mediaStatusFilter: 'all', mediaRatingFilter: 0, hiddenHabitKeys: [], brand: { name: '日常集', avatar: '日', tagline: '生活有迹可循', theme: 'plum' }, fitnessProfile: { height: 165, target: 55, startWeight: 60, age: 30, sex: 'female', activity: 1.375 }, weeklyPlan: [] },
  };
}

// The persisted journal a v16 read-back race would leave behind: local == cloud content,
// but the task op id never matches the cloud change id, so nothing could ever clear it.
function seedJournal(state) {
  const rows = buildCloud()['db-money'];
  const sync = { version: 1, initialized: true, base: {}, queue: {}, conflicts: {}, lastSync: null };
  rows.forEach((r, i) => {
    const value = JSON.parse(r['完整数据']);
    sync.base['money:' + value.id] = { value, remoteId: r._id, revision: r['变更ID'], deleted: false };
    if (i < CONFLICTED) {
      sync.queue['money:' + value.id] = { kind: 'money', id: value.id, value, base: { value, remoteId: r._id, revision: 'stale-rev-' + i, deleted: false }, opId: 'local-op-' + i, attempted: true };
      sync.conflicts['money:' + value.id] = { kind: 'money', local: value, remote: { kind: 'money', id: value.id, value, remoteId: r._id, revision: 'stale-rev-' + i, deleted: false, legacy: false }, reason: '写入后发现其他修改', duplicate: false };
    }
  });
  state.sync = sync;
  return state;
}

function makeDb(tables, log, opts = {}) {
  const unwrap = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Object.values(v)[0]]));
  let serial = 0;
  return {
    async getSchema({ databaseId }) { return clone(SCHEMAS[Object.entries(IDS).find(([, v]) => v === databaseId)[0]]); },
    async query(p) {
      log.calls.push({ m: 'query', id: p.databaseId });
      let rows = clone(tables[p.databaseId] || []);
      if (p.filter) { const f = p.filter.property; rows = rows.filter(r => r[f.property] === f.text.equals); }
      const start = p.startCursor ? Number(p.startCursor) : 0, page = rows.slice(start, start + 100);
      return { results: page, hasMore: start + 100 < rows.length, nextCursor: String(start + 100) };
    },
    async addRecord(p) {
      log.calls.push({ m: 'add', id: p.databaseId });
      const id = 'remote-' + (++serial);
      (tables[p.databaseId] = tables[p.databaseId] || []).push({ _id: id, ...unwrap(p.properties) });
      return { id };
    },
    async updateRecord(p) {
      log.calls.push({ m: 'update', id: p.databaseId, stable: p.properties['稳定ID'] && p.properties['稳定ID'].text });
      const row = (tables[p.databaseId] || []).find(r => r._id === p.recordId); assert.ok(row);
      Object.assign(row, unwrap(p.properties)); return { id: p.recordId };
    },
    // opts.staleRevision models a read-back that lags behind the write: content is correct,
    // only the change marker is old. That is exactly what produced the phantom conflicts.
    async getRecord(p) {
      const row = clone((tables[p.databaseId] || []).find(r => r._id === p.recordId) || null);
      if (row && opts.staleRevision) row['变更ID'] = 'stale-rev';
      return { result: row };
    },
    async deleteRecord() { throw Error('no physical delete'); },
  };
}

async function boot(tables, storage, db) {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {}, disabled: false, hidden: false, innerHTML: '', value: '', addEventListener() {}, replaceChildren() {}, appendChild() {}, append() {}, classList: { toggle() {}, add() {}, remove() {} } }); return nodes.get(id); };
  const timers = new Set();
  const context = vm.createContext({
    URL, Date, Math, Intl, JSON, Promise, Set, Map, Number, String, Boolean, Object, Array, RegExp, Error, crypto, console,
    location: 'https://local.test/', navigator: { onLine: true, locks: { request: (n, o, cb) => Promise.resolve(cb({})) } },
    window: { __SMART_PAGE__: { database: db }, addEventListener() {}, confirm: () => true },
    document: { documentElement: { lang: 'zh' }, getElementById: id => node(id), querySelector: () => node('save-state'), querySelectorAll: () => [], addEventListener() {}, createElement: t => node('el-' + t + Math.random()), createTextNode: t => ({ text: t }) },
    localStorage: { getItem: k => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; } },
    setTimeout: (fn, ms) => { const t = setImmediate(() => { timers.delete(t); fn(); }); timers.add(t); return t; },
    clearTimeout: t => { timers.delete(t); },
    downloadBlob() {}, askConfirm: () => Promise.resolve(true),
  });
  const tail = "  startI18n();\n  document.addEventListener('DOMContentLoaded',()=>acquireWorkbenchEditor(init));";
  const exposed = `
    renderAll=()=>{};renderHabitManageList=()=>{};toast=()=>{};pulseSaved=()=>{};
    globalThis.api={ get state(){return state}, get runtime(){return syncRuntime},
      prepareSync,saveState,runSync,collectEntities,syncState,renderSyncStatus,SYNC_TABLES,startSync };
  `;
  vm.runInContext(source.replace(tail, exposed), context, { timeout: 30000 });
  const api = context.api;
  for (const [k, v] of Object.entries(IDS)) api.SYNC_TABLES[k] = v;
  return { api, saveText: node('saveText') };
}

async function scenarioA(label) {
  const tables = buildCloud();
  const log = { calls: [] };
  const db = makeDb(tables, log);
  const storage = { 'richangji-state-v1': JSON.stringify(seedJournal(localState())) };
  const { api, saveText } = await boot(tables, storage, db);
  const before = Object.keys(api.syncState().conflicts).length;
  const updatesBefore = log.calls.filter(c => c.m === 'update').length;
  await Promise.resolve(api.startSync());
  await sleep(3000);
  const after = Object.keys(api.syncState().conflicts).length;
  const updates = log.calls.filter(c => c.m === 'update').length;
  console.log('%s\n  冲突 %d -> %d | 队列 %d | 云端改写次数 %d | 状态栏「%s」',
    label, before, after, Object.keys(api.syncState().queue).length, updates - updatesBefore, saveText.textContent);
  return { before, after, updates: updates - updatesBefore, text: saveText.textContent };
}

async function scenarioB(label) {
  // A real edit that lands in the cloud, but whose read-back returns a lagging change marker.
  const tables = buildCloud();
  const log = { calls: [] };
  const db = makeDb(tables, log, { staleRevision: true });
  const storage = { 'richangji-state-v1': JSON.stringify(localState()) };
  const { api, saveText } = await boot(tables, storage, db);
  await Promise.resolve(api.startSync());
  await sleep(1500);
  const row = api.state.records.find(r => r.id === 'money-1');
  row.data.note = '改过的备注';
  await Promise.resolve(api.saveState());
  await sleep(3000);
  const s = api.syncState();
  console.log('%s\n  冲突 %d | 队列 %d | 云端值「%s」| 状态栏「%s」\n  诊断 update=%d err=%s busy=%s task=%s',
    label, Object.keys(s.conflicts).length, Object.keys(s.queue).length,
    JSON.parse(tables['db-money'].find(r => r._id === 'money-1')['完整数据']).data.note, saveText.textContent,
    log.calls.filter(c => c.m === 'update').length, api.runtime.error || '-', api.runtime.busy,
    JSON.stringify(Object.entries(s.queue).map(([k, t]) => ({ k, opId: t.opId, attempted: t.attempted, hasBase: Boolean(t.base) }))));
  return { conflicts: Object.keys(s.conflicts).length, note: JSON.parse(tables['db-money'].find(r => r._id === 'money-1')['完整数据']).data.note, text: saveText.textContent };
}

(async () => {
  console.log('目标文件:', target);
  const a = await scenarioA('场景A：本机残留 33 项幽灵冲突（两端内容其实一致）');
  const b = await scenarioB('场景B：写入成功但回读返回滞后的变更ID');
  console.log('---');
  console.log('A 期望 after=0, 云端改写=0 ; 实际 after=%d, 改写=%d -> %s', a.after, a.updates,
    (a.after === 0 && a.updates === 0) ? 'PASS' : 'FAIL');
  console.log('B 期望 conflicts=0 且云端已写入新备注 ; 实际 conflicts=%d, 云端值=%s -> %s', b.conflicts, b.note,
    (b.conflicts === 0 && b.note === '改过的备注') ? 'PASS' : 'FAIL');
})();
