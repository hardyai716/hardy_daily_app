  /* ================= Money Explorer v24 ================= */
  var MONEY_PAGE_SIZE=60;
  var moneyExplorer={query:'',from:'',to:'',limit:MONEY_PAGE_SIZE};

  function normalizedSearch(value){
    return String(value==null?'':value).normalize('NFKC').trim().toLocaleLowerCase();
  }
  function moneyMatches(record){
    var query=normalizedSearch(moneyExplorer.query),data=record.data||{};
    if(moneyExplorer.from&&record.date<moneyExplorer.from)return false;
    if(moneyExplorer.to&&record.date>moneyExplorer.to)return false;
    if(!query)return true;
    var haystack=[
      data.note,data.category,data.flow,
      t(data.flow==='income'?'收入':'支出'),
      data.amount,record.date
    ].map(normalizedSearch).join(' ');
    return haystack.includes(query);
  }
  function renderMoneyRecords(categoryRecords){
    var list=document.getElementById('moneyList');
    var summary=document.getElementById('moneyResultSummary');
    var load=document.getElementById('moneyLoadMore');
    if(moneyExplorer.from&&moneyExplorer.to&&moneyExplorer.from>moneyExplorer.to){
      list.innerHTML=empty(editText('起始日期不能晚于结束日期','Start date cannot be after end date'));
      if(summary)summary.textContent=editText('请调整日期范围','Adjust the date range');
      if(load)load.hidden=true;
      return;
    }
    var matches=categoryRecords.filter(moneyMatches),visible=matches.slice(0,moneyExplorer.limit);
    list.innerHTML=visible.length?visible.map(recordRow).join(''):empty('这个筛选条件下还没有流水');
    if(summary)summary.textContent=LANG==='en'
      ?`${matches.length} found · ${visible.length} shown`
      :`找到 ${matches.length} 条 · 已显示 ${visible.length} 条`;
    if(load){
      var remaining=Math.max(0,matches.length-visible.length);
      load.hidden=!remaining;
      load.innerHTML=icon('i-more')+(LANG==='en'
        ?`Show ${Math.min(MONEY_PAGE_SIZE,remaining)} more`
        :`再显示 ${Math.min(MONEY_PAGE_SIZE,remaining)} 条`);
    }
  }
  function resetMoneyExplorer(){
    moneyExplorer={query:'',from:'',to:'',limit:MONEY_PAGE_SIZE};
    var search=document.getElementById('moneySearch');
    var from=document.getElementById('moneyDateFrom');
    var to=document.getElementById('moneyDateTo');
    if(search)search.value='';
    if(from){from.value='';dtSync(from);}
    if(to){to.value='';dtSync(to);}
    state.settings.moneyFilter='all';
    var category=document.getElementById('moneyFilter');if(category)category.value='all';
    saveState();renderMoney();
  }
  function setupMoneyExplorer(){
    var list=document.getElementById('moneyList'),panel=list&&list.closest('.panel');
    if(!panel||document.getElementById('moneyExplorer'))return;
    var controls=document.createElement('div');
    controls.id='moneyExplorer';controls.className='money-explorer';
    controls.innerHTML='<label class="money-search"><svg aria-hidden="true"><use href="#i-search"/></svg>'
      +`<input id="moneySearch" type="search" maxlength="60" placeholder="${editText('搜索备注、分类或金额','Search note, category or amount')}" aria-label="${editText('搜索账目','Search transactions')}"></label>`
      +'<div class="money-dates">'
      +`<label><span>${editText('从','From')}</span><input id="moneyDateFrom" type="date" aria-label="${editText('起始日期','Start date')}"></label>`
      +`<label><span>${editText('到','To')}</span><input id="moneyDateTo" type="date" aria-label="${editText('结束日期','End date')}"></label>`
      +'</div>'
      +'<div class="money-result-row">'
      +'<span id="moneyResultSummary"></span>'
      +`<button type="button" class="text-btn" data-action="reset-money-explorer">${icon('i-x')}${editText('清空筛选','Clear')}</button>`
      +'</div>';
    panel.insertBefore(controls,list);
    var load=document.createElement('button');
    load.id='moneyLoadMore';load.type='button';load.className='btn ghost money-load-more';
    load.dataset.action='load-more-money';load.hidden=true;
    list.insertAdjacentElement('afterend',load);
    controls.querySelector('#moneySearch').addEventListener('input',function(event){
      moneyExplorer.query=event.target.value;moneyExplorer.limit=MONEY_PAGE_SIZE;renderMoney();
    });
    [['moneyDateFrom','from'],['moneyDateTo','to']].forEach(function(entry){
      controls.querySelector('#'+entry[0]).addEventListener('change',function(event){
        moneyExplorer[entry[1]]=event.target.value;moneyExplorer.limit=MONEY_PAGE_SIZE;renderMoney();
      });
    });
    document.getElementById('moneyFilter').addEventListener('change',function(){
      moneyExplorer.limit=MONEY_PAGE_SIZE;
    });
    document.addEventListener('click',function(event){
      var action=event.target.closest('[data-action]');
      if(!action)return;
      if(action.dataset.action==='reset-money-explorer')resetMoneyExplorer();
      if(action.dataset.action==='load-more-money'){
        var top=list.scrollTop;
        moneyExplorer.limit+=MONEY_PAGE_SIZE;renderMoney();
        requestAnimationFrame(function(){list.scrollTop=top;});
      }
    });
  }
