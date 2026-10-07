// Native browser actions against the local candidate only. No cloud credentials or real records.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../candidate/v15/index.html'));
const results={method:'Isolated Chrome, native UI actions, local HTML, external network blocked',views:[],checks:[],pageErrors:[]};
let browser,server;
(async()=>{
  server=http.createServer((req,res)=>{
    if(req.url.startsWith('/app')){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}
    else{res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}/app`;
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>results.pageErrors.push(e.message));
  await page.goto(base,{waitUntil:'load'});await page.locator('#syncSummary').filter({hasText:'已存本机'}).waitFor();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    for(const key of ['dashboard','money','habits','fitness','planner','home','media','archive']){
      const nav=page.locator((width===390?'.mobile-nav':'.side-nav')+' [data-nav="'+key+'"]');
      if(await nav.count())await nav.click();
      else{
        await page.locator('.mobile-nav [data-nav=dashboard]').click();
        await page.locator('#view-dashboard '+(key==='archive'?'[data-nav=archive]':'[data-quick="'+key+'"]')).click();
      }
      await page.locator('#view-'+key+'.active').waitFor();
      const geometry=await page.evaluate(()=>({view:document.querySelector('.view.active').id,viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(geometry.scroll<=width+1);results.views.push({width,key,...geometry});
    }
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('.side-nav [data-nav=money]').click();
  await page.locator('#moneyForm input[name=amount]').fill('12.34');
  await page.locator('#moneyForm input[name=note]').fill('隔离回归账目');
  await page.locator('#moneyForm .dt-display').click();await page.locator('.dt-pop [data-dt=yesterday]').click();
  const before=await page.locator('#moneyForm input[name=date]').inputValue();
  await page.locator('#moneyForm button[type=submit]').click();
  const dateState=await page.evaluate(()=>({
    value:document.querySelector('#moneyForm input[name=date]').value,
    text:document.querySelector('#moneyForm .dt-display b').textContent,
    stored:JSON.parse(localStorage.getItem('richangji-state-v1')).records[0].date
  }));
  assert.equal(dateState.stored,before);assert.notEqual(dateState.value,before);
  const [,month,day]=dateState.value.split('-');assert.ok(dateState.text.startsWith(`${Number(month)}月${Number(day)}日`));
  results.checks.push({name:'date reset matches displayed date while stored record keeps selected date',passed:true});
  await page.reload({waitUntil:'load'});
  await page.locator('#syncSummary').filter({hasText:'已存本机'}).waitFor();
  assert.equal(await page.locator('#moneyList .record-row').filter({hasText:'隔离回归账目'}).count(),1);
  const second=await context.newPage();await second.goto(base,{waitUntil:'load'});
  await second.getByText('另一个工作台页面正在使用此设备的数据。请关闭另一个页面后刷新，避免两页互相覆盖。',{exact:true}).waitFor();
  await second.close();results.checks.push({name:'second editor blocked by browser Web Lock',passed:true});
  await page.locator('.side-nav [data-nav=planner]').click();
  await page.locator('#plannerForm input[name=title]').fill('隔离回归日程');
  await page.locator('#plannerForm .dt-wrap').filter({has:page.locator('input[type=time]')}).locator('button').click();
  await page.locator('.dt-col[data-col=h]').hover();await page.mouse.wheel(0,34);
  await page.waitForFunction(()=>document.querySelector('#plannerForm input[type=time]').value!=='');
  const selected=await page.locator('#plannerForm input[type=time]').inputValue();
  await page.locator('.dt-pop [data-dt=done]').click();await page.locator('#plannerForm button[type=submit]').click();
  assert.equal(await page.locator('#plannerForm input[type=time]').inputValue(),'');
  assert.equal(await page.locator('#plannerForm .dt-wrap').filter({has:page.locator('input[type=time]')}).locator('b').textContent(),'选择时间');
  const storedTime=await page.evaluate(()=>JSON.parse(localStorage.getItem('richangji-state-v1')).records.find(r=>r.type==='planner').data.time);
  assert.equal(storedTime,selected);results.checks.push({name:'time wheel submit clears visible label and retains selected record time',passed:true});
  await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav [data-nav=money]').click();
  assert.equal(await page.locator('#syncSummary').isVisible(),true);
  assert.ok((await page.locator('#syncSummary').textContent()).includes('未连接云端'));
  assert.equal(await page.locator('#syncRetry').isDisabled(),true);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#view-money')).opacity==='1');
  await page.screenshot({path:path.join(__dirname,'browser-mobile.png'),fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.locator('#syncExport').click();
  const download=await downloadPromise;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const backup=JSON.parse(Buffer.concat(chunks));assert.equal(backup.state.records.length,2);assert.ok(Object.keys(backup.state.sync.queue).length>=2);
  results.checks.push({name:'mobile shows local-only state and recovery export includes records and outbox',passed:true});
  assert.deepEqual(results.pageErrors,[]);
  console.log(JSON.stringify({viewChecks:results.views.length,checks:results.checks,pageErrors:results.pageErrors},null,2));
})().catch(error=>{results.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
  if(browser)await browser.close();if(server)server.close();
});
