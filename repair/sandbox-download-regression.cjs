// Proves the WorkBuddy iframe sandbox blocks the old path and accepts the popup path.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const oldHtml = fs.readFileSync(path.join(__dirname, '../candidate/v19/index.html'));
const newHtml = fs.readFileSync(path.join(__dirname, '../candidate/v20/index.html'));
const sandbox = [
  'allow-scripts',
  'allow-same-origin',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-forms',
  'allow-modals',
].join(' ');
const result = {
  method: 'Local outer page with the exact WorkBuddy iframe sandbox flags',
  checks: [],
};
let server;
let browser;

function waitForDownload(context, timeout = 4000) {
  return new Promise(resolve => {
    let settled = false;
    const attach = page => page.on('download', download => {
      if (!settled) {
        settled = true;
        resolve(download);
      }
    });
    context.pages().forEach(attach);
    context.on('page', attach);
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeout);
  });
}

async function open(mode) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const warnings = [];
  page.on('console', message => warnings.push(message.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/outer?mode=${mode}`);
  const frame = page.frames().find(item => item.url().includes(`/inner-${mode}`));
  assert.ok(frame, `missing ${mode} iframe`);
  await frame.locator('#syncSummary').filter({ hasText: '已存本机' }).waitFor();
  return { context, page, frame, warnings };
}

(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/outer') {
      const mode = url.searchParams.get('mode');
      res.setHeader('Content-Type', 'text/html;charset=utf-8');
      res.end(`<iframe style="width:100vw;height:100vh;border:0" sandbox="${sandbox}" src="/inner-${mode}"></iframe>`);
      return;
    }
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(url.pathname === '/inner-new' ? newHtml : oldHtml);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const old = await open('old');
  let pending = waitForDownload(old.context, 1000);
  await old.frame.locator('#syncExport').click();
  assert.equal(await pending, null);
  assert.ok(old.warnings.some(text => /download.*sandbox|sandbox.*download/i.test(text)));
  result.checks.push('old direct anchor is blocked by the WorkBuddy sandbox');
  await old.context.close();

  const current = await open('new');
  pending = waitForDownload(current.context);
  await current.frame.locator('#syncExport').click();
  let download = await pending;
  assert.ok(download);
  assert.equal(download.suggestedFilename(), '日常集-完整备份-2026-10-07.json');
  result.checks.push('v20 complete JSON backup downloads through an escaped popup');

  await current.frame.locator('.side-nav [data-nav=money]').click();
  pending = waitForDownload(current.context);
  await current.frame.locator('[data-action=export-money]').click();
  download = await pending;
  assert.ok(download);
  assert.equal(download.suggestedFilename(), '记账流水-2026-10-07.csv');
  result.checks.push('v20 money CSV downloads through the same path');

  fs.writeFileSync(
    path.join(__dirname, 'sandbox-download-results.json'),
    JSON.stringify(result, null, 2) + '\n'
  );
  console.log(JSON.stringify(result, null, 2));
})().catch(error => {
  result.failure = error.message;
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
