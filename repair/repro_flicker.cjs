// Reproduce the habits-page sync flicker: real timers, realistic data volume, v14-like local state.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const html = fs.readFileSync(__dirname + '/../candidate/v15/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const source = scripts.find(s => s.includes('Database SDK Integration')).replace(/\r+\n/g, '\n');
const clone = v => JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- realistic cloud -------------------------------------------------------
function buildCloud() {
  const tables = {};
  const money = [];
  const cats = ['餐饮美食', '交通出行', '商超便利', '购物网购', '生活缴费', '人情往来'];
  for (let i = 0; i < 938; i++) {
    const d = new Date(2026, 0, 1 + (i % 280));
    const amt = (i % 7 === 0) ? 12000 : Math.round(30 + (i * 13) % 400);
    money.push({
      _id: 'money-' + i, '稳定ID': 'money-' + i, '日期': d.toISOString().slice(0, 10), '分类': cats[i % cats.length],
      '金额': (i % 7 === 0) ? amt : -amt, '备注': (i % 7 === 0) ? '收入：工资' : '商户 ' + i,
    });
  }
  tables['db-money'] = money;
  tables['db-checkin'] = [
    { _id: 'ck-sleep', '习惯ID': 'habit-sleep', '日期': '2026-10-07', '习惯': '睡觉', '数值': 7, '备注': '小时', '稳定ID': 'habit-sleep/2026-10-07', '变更ID': 'migration-v15:habit-sleep/2026-10-07', '完整数据': JSON.stringify({ id: 'habit-sleep/2026-10-07', habitId: 'habit-sleep', date: '2026-10-07', value: 7, name: '睡觉', unit: '小时' }), '已删除': false },
    { _id: 'ck-water', '习惯ID': 'habit-water', '日期': '2026-10-07', '习惯': '喝水', '数值': 2, '备注': '杯', '稳定ID': 'habit-water/2026-10-07', '变更ID': 'migration-v15:habit-water/2026-10-07', '完整数据': JSON.stringify({ id: 'habit-water/2026-10-07', habitId: 'habit-water', date: '2026-10-07', value: 2, name: '喝水', unit: '杯' }), '已删除': false },
  ];
  const defs = [
    { id: 'habit-water', key: 'water', name: '喝水', type: 'counter', target: 8, unit: '杯', tone: 'sage', archived: false },
    { id: 'habit-sleep', key: 'sleep', name: '睡觉', type: 'number', target: 7, unit: '小时', tone: 'plum', archived: false },
    { id: 'habit-exercise', key: 'exercise', name: '运动', type: 'check', target: 1, unit: '次', tone: 'terracotta', archived: false },
    { id: 'habit-reading', key: 'reading', name: '看书', type: 'check', target: 1, unit: '次', tone: 'sand', archived: false },
    { id: 'habit-meditation', key: 'meditation', name: '冥想', type: 'check', target: 1, unit: '次', tone: 'sage', archived: false },
  ];
  tables['db-habit'] = defs.map(d => ({
    _id: 'def-' + d.id, '稳定ID': d.id, '变更ID': 'migration-v15:' + d.id, '完整数据': JSON.stringify(d), '已删除': false,
    '名称': d.name, '类型': d.type, '目标': d.target, '单位': d.unit, '主题色': d.tone, '已归档': false,
  }));
  tables['db-planner'] = [
    { _id: 'pl-1', '日期': '2026-08-14T00:00:00Z', '内容': '整理本周生活清单', '类型': '生活', '状态': '待完成' },
    { _id: 'pl-2', '日期': '2026-10-07', '内容': '质量流程skill', '类型': '工作', '状态': '已完成' },
  ];
  tables['db-fitness'] = [
    { _id: 'ft-1', '日期': '2026-10-07', '体重': 75, '体脂率': 0, '备注': '' },
    { _id: 'ft-2', '日期': '2026-10-06', '体重': 75.6, '体脂率': 0, '备注': '' },
  ];
  tables['db-media'] = [{ _id: 'md-1', '标题': '宇宙探索编辑部', '类型': '电影', '状态': '看过', '评分': 5, '短评': '荒诞又真诚。' }];
  tables['db-home'] = [];
  tables['db-settings'] = [];
  return tables;
}

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

const IDS = { money: 'db-money', planner: 'db-planner', fitness: 'db-fitness', home: 'db-home', media: 'db-media', habit: 'db-habit', checkin: 'db-checkin', settings: 'db-settings' };

function makeDb(tables, log, opts) {
  const unwrap = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Object.values(v)[0]]));
  let serial = 0;
  return {
    async getSchema({ databaseId }) { return clone(SCHEMAS[Object.entries(IDS).find(([, v]) => v === databaseId)[0]]); },
    async query(p) {
      log.calls.push({ m: 'query', id: p.databaseId, filter: p.filter && p.filter.property.property });
      let rows = clone(tables[p.databaseId] || []);
      if (p.filter) { const f = p.filter.property; rows = rows.filter(r => r[f.property] === f.text.equals); }
      const start = p.startCursor ? Number(p.startCursor) : 0, page = rows.slice(start, start + 100);
      return { results: page, hasMore: start + 100 < rows.length, nextCursor: String(start + 100) };
    },
    async addRecord(p) {
      log.calls.push({ m: 'add', id: p.databaseId, stable: p.properties['稳定ID'] && p.properties['稳定ID'].text });
      const id = 'remote-' + (++serial);
      (tables[p.databaseId] = tables[p.databaseId] || []).push({ _id: id, ...unwrap(p.properties) });
      if (opts.addReturnsNothing) return {};
      return { id };
    },
    async updateRecord(p) {
      log.calls.push({ m: 'update', id: p.databaseId, stable: p.properties['稳定ID'] && p.properties['稳定ID'].text });
      const row = (tables[p.databaseId] || []).find(r => r._id === p.recordId); assert.ok(row);
      Object.assign(row, unwrap(p.properties)); return { id: p.recordId };
    },
    async getRecord(p) { return { result: clone((tables[p.databaseId] || []).find(r => r._id === p.recordId) || null) }; },
    async deleteRecord() { throw Error('no physical delete'); },
  };
}

// ---- v14-like local state --------------------------------------------------
function v14State() {
  const today = '2026-10-07';
  const entries = { 'habit-sleep': { '2026-10-05': 7, '2026-10-06': 7.5, '2026-10-07': 7 }, 'habit-water': { '2026-10-07': 2 } };
  const remoteIds = { 'habit-sleep': { '2026-10-07': 'ck-sleep' }, 'habit-water': { '2026-10-07': 'ck-water' } };
  const defs = [
    { key: 'water', name: '喝水', nameEn: 'Drink water', type: 'counter', target: 8, unit: '杯', unitEn: 'cups', tone: 'sage' },
    { key: 'sleep', name: '睡觉', nameEn: 'Sleep', type: 'number', target: 7, unit: '小时', unitEn: 'hours', tone: 'plum' },
    { key: 'exercise', name: '运动', nameEn: 'Exercise', type: 'check', target: 1, unit: '次', unitEn: 'times', tone: 'terracotta' },
    { key: 'reading', name: '看书', nameEn: 'Read', type: 'check', target: 1, unit: '次', unitEn: 'times', tone: 'sand' },
    { key: 'meditation', name: '冥想', nameEn: 'Meditate', type: 'check', target: 1, unit: '次', unitEn: 'times', tone: 'sage' },
  ];
  const records = [];
  for (let i = 0; i < 938; i++) {
    const d = new Date(2026, 0, 1 + (i % 280));
    const amt = (i % 7 === 0) ? 12000 : Math.round(30 + (i * 13) % 400);
    const income = i % 7 === 0;
    records.push({ id: 'money-' + i, type: 'money', date: d.toISOString().slice(0, 10), createdAt: 1791277291048 + i * 1000, sample: false, remoteId: 'money-' + i,
      data: { flow: income ? 'income' : 'expense', amount: amt, category: ['餐饮美食','交通出行','商超便利','购物网购','生活缴费','人情往来'][i % 6], note: income ? '工资' : '商户 ' + i } });
  }
  return {
    version: 2, records, habits: defs.map((def, i) => ({ ...def, id: 'habit-' + def.key, entries: entries[def.key] || {}, remoteIds: remoteIds[def.key] || {}, sample: false })),
    mediaItems: [{ id: 'md-1', name: '宇宙探索编辑部', type: '电影', status: '看完', rating: 5, review: '荒诞又真诚。', date: '', cover: '', sample: false, remoteId: 'md-1' }],
    drafts: {}, settings: { budget: 5000, recordsSinceExport: 0, moneySinceExport: 0, lastExportAt: null, archiveFilter: 'all', moneyFilter: 'all', plannerFilter: 'all', shoppingFilter: 'pending', mediaView: 'wall', mediaStatusFilter: 'all', mediaRatingFilter: 0, hiddenHabitKeys: [], brand: { name: '日常集', avatar: '日', tagline: '生活有迹可循', theme: 'plum' }, fitnessProfile: { height: 165, target: 55, startWeight: 60, age: 30, sex: 'female', activity: 1.375 }, weeklyPlan: [] },
  };
}

async function run(label, opts = {}) {
  const tables = buildCloud();
  const log = { calls: [], passes: 0, statuses: [] };
  const db = makeDb(tables, log, opts);
  const storage = { 'richangji-state-v2': JSON.stringify(v14State()) };
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', style: {}, disabled: false, hidden: false, innerHTML: '', value: '', addEventListener() {}, replaceChildren() {}, appendChild() {}, append() {}, classList: { toggle() {}, add() {}, remove() {} } }); return nodes.get(id); };
  const timers = new Set();
  const context = vm.createContext({
    URL, Date, Math, Intl, JSON, Promise, Set, Map, Number, String, Boolean, Object, Array, RegExp, Error, crypto, console,
    location: 'https://local.test/', navigator: { onLine: true, locks: { request: (n, o, cb) => Promise.resolve(cb({})) } },
    window: { __SMART_PAGE__: { database: db }, addEventListener() {}, confirm: () => true },
    document: { documentElement: { lang: 'zh' }, getElementById: id => id === 'syncConflicts' ? node(id) : node(id), querySelector: () => node('save-state'), querySelectorAll: () => [], addEventListener() {}, createElement: t => node('el-' + t + Math.random()), createTextNode: t => ({ text: t }) },
    localStorage: { getItem: k => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; } },
    setTimeout: (fn, ms) => { const t = setImmediate(() => { timers.delete(t); fn(); }); timers.add(t); return t; },
    clearTimeout: t => { timers.delete(t); },
    downloadBlob() {}, askConfirm: () => Promise.resolve(true),
  });
  const tail = "  startI18n();\n  document.addEventListener('DOMContentLoaded',()=>acquireWorkbenchEditor(init));";
  const exposed = `
    renderAll=()=>{globalThis.__renders++};renderHabitManageList=()=>{};toast=()=>{};pulseSaved=()=>{};
    globalThis.__renders=0;globalThis.__collect=0;
    const __ce=collectEntities;collectEntities=function(){globalThis.__collect++;return __ce();};
    globalThis.api={ get state(){return state}, get runtime(){return syncRuntime},
      prepareSync,saveState,runSync,collectEntities,syncState,renderSyncStatus,SYNC_TABLES,startSync };
  `;
  vm.runInContext(source.replace(tail, exposed), context, { timeout: 30000 });
  const api = context.api;
  for (const [k, v] of Object.entries(IDS)) api.SYNC_TABLES[k] = v;

  const t0 = Date.now();
  await Promise.resolve(api.startSync());
  const firstSyncMs = Date.now() - t0;
  const afterFirst = { renders: context.__renders, collect: context.__collect, calls: log.calls.length, queue: Object.keys(api.syncState().queue).length };

  // Simulate the user tapping a habit check-in, which is what the screenshots show.
  const t1 = Date.now();
  await Promise.resolve(api.saveState());
  const saveMs = Date.now() - t1;
  await sleep(4000);
  const secondSyncMs = Date.now() - t1 - saveMs;
  const afterTap = { renders: context.__renders, collect: context.__collect, calls: log.calls.length, queue: Object.keys(api.syncState().queue).length };

  const statuses = [];
  const timer = setInterval(() => {
    const s = api.runtime, q = api.syncState();
    statuses.push(`busy=${s.busy} err=${s.error ? s.error.slice(0, 26) : ''} queue=${Object.keys(q.queue).length} att=${Object.values(q.queue).filter(t => t.attempted).length}`);
  }, 120);
  await sleep(4000);
  clearInterval(timer);

  const adds = log.calls.filter(c => c.m === 'add');
  const addByStable = {};
  adds.forEach(c => { addByStable[c.stable] = (addByStable[c.stable] || 0) + 1; });
  const dupAdds = Object.entries(addByStable).filter(([, n]) => n > 1);
  console.log('=== ' + label + ' ===');
  console.log('首次 startSync 阻塞: %dms | collectEntities 调用: %d | renderAll: %d | SDK 调用: %d (query %d / add %d / update %d)',
    firstSyncMs, afterFirst.collect, afterFirst.renders, afterFirst.calls,
    log.calls.filter(c => c.m === 'query').length, adds.length, log.calls.filter(c => c.m === 'update').length);
  console.log('首次同步后队列: %d', afterFirst.queue);
  console.log('模拟打卡 saveState: %dms | 之后 4s 内: renders=%d collect=%d calls=%d queue=%d',
    saveMs, afterTap.renders, afterTap.collect, afterTap.calls, afterTap.queue);
  console.log('队列终态:', JSON.stringify(Object.entries(api.syncState().queue).map(([k, t]) => ({ k, attempted: t.attempted, hasBase: Boolean(t.base) }))));
  console.log('冲突:', Object.keys(api.syncState().conflicts).length, '| 最后状态:', statuses.slice(-2).join('  ') || '(空闲)');
  if (dupAdds.length) console.log('!! 同一稳定ID被重复新增:', JSON.stringify(dupAdds));
  return { log, statuses };
}

(async () => {
  await run('基线：addRecord 返回 {id}（当前实现假设）');
  await run('对照：addRecord 返回 {}（契约未写明返回值）', { addReturnsNothing: true });
})();
