  /* ================= Record Editing v23 ================= */
  var editSession = null;
  var EDIT_FORMS = {
    money:{form:'moneyForm',view:'money',title:['编辑账目','Edit transaction'],saved:['账目已更新','Transaction updated']},
    planner:{form:'plannerForm',view:'planner',title:['编辑日程','Edit task'],saved:['日程已更新','Task updated']},
    fitness:{form:'fitnessForm',view:'fitness',title:['编辑身体记录','Edit fitness entry'],saved:['身体记录已更新','Fitness entry updated']},
    home:{form:'homeForm',view:'home',title:['编辑待买物品','Edit shopping item'],saved:['待买物品已更新','Shopping item updated']},
    media:{form:'mediaForm',view:'media',title:['编辑书影音','Edit media item'],saved:['书影音已更新','Media item updated']}
  };

  function editText(zh,en){return LANG==='en'?en:zh;}
  function editRecordButton(id){
    return `<button class="edit-btn" data-action="edit-record" data-id="${escapeHtml(id)}" aria-label="${editText('编辑','Edit')}">${icon('i-edit')}</button>`;
  }
  function findEditableRecord(kind,id){
    return kind==='media'
      ?state.mediaItems.find(item=>String(item.id)===String(id))
      :state.records.find(record=>record.type===kind&&String(record.id)===String(id));
  }
  function setNamedValue(form,name,value){
    Array.from(form.elements).filter(field=>field.name===name).forEach(function(field){
      if(field.type==='radio')field.checked=field.value===String(value);
      else if(field.type==='checkbox')field.checked=Boolean(value);
      else field.value=value==null?'':String(value);
      if(field.type==='date'||field.type==='time')dtSync(field);
    });
  }
  function applyFormValues(form,values){
    Object.entries(values||{}).forEach(entry=>setNamedValue(form,entry[0],entry[1]));
  }
  function showMediaCover(value){
    pendingMediaCover=value||'';
    var input=document.getElementById('mediaCoverInput');
    var preview=document.getElementById('mediaCoverPreview');
    input.value='';
    input.closest('.cover-upload').classList.toggle('has-cover',Boolean(pendingMediaCover));
    preview.style.backgroundImage=pendingMediaCover?`url(${pendingMediaCover})`:'';
  }
  function editValues(kind,item){
    var d=item.data||{};
    if(kind==='money')return {flow:d.flow,amount:d.amount,category:d.category,date:item.date,note:d.note||''};
    if(kind==='planner')return {title:d.title,date:item.date,time:d.time||'',list:d.list||'生活',priority:d.priority||'normal',note:d.note||'',remind:Boolean(d.remind)};
    if(kind==='fitness')return {weight:d.weight,bodyFat:d.bodyFat,calories:d.calories,duration:d.duration,date:item.date,note:d.note||''};
    if(kind==='home')return {name:d.name,quantity:d.quantity||'',category:d.category||'其他',price:d.price,priority:d.priority||'normal',note:d.note||''};
    return {name:item.name,type:item.type,status:item.status,rating:item.rating,date:item.date,review:item.review||''};
  }
  function setEditUi(session,active){
    var form=session.form,panel=form.closest('.form-panel');
    var heading=panel&&panel.querySelector('.panel-head h2');
    var status=document.querySelector(`[data-draft-for="${form.dataset.draft}"]`);
    var submit=form.querySelector('button[type="submit"]');
    if(active){
      session.heading=heading;session.headingText=heading&&heading.textContent;
      session.status=status;session.statusText=status&&status.textContent;
      session.submit=submit;session.submitHtml=submit&&submit.innerHTML;
      if(heading)heading.textContent=editText(...EDIT_FORMS[session.kind].title);
      if(status)status.textContent=editText('正在编辑','Editing');
      if(submit)submit.innerHTML=icon('i-check')+editText('保存修改','Save changes');
      var cancel=document.createElement('button');
      cancel.type='button';cancel.className='btn ghost full edit-cancel';
      cancel.dataset.action='cancel-record-edit';
      cancel.textContent=editText('取消编辑','Cancel editing');
      form.insertBefore(cancel,submit);
      session.cancel=cancel;
      if(session.kind==='media'){
        var remove=document.createElement('button');
        remove.type='button';remove.className='text-btn edit-remove-cover';
        remove.dataset.action='remove-edit-cover';
        remove.textContent=editText('移除当前封面','Remove current cover');
        form.insertBefore(remove,cancel);
        session.removeCover=remove;
      }
    }else{
      if(session.heading)session.heading.textContent=session.headingText;
      if(session.status)session.status.textContent=session.statusText;
      if(session.submit)session.submit.innerHTML=session.submitHtml;
      session.cancel&&session.cancel.remove();
      session.removeCover&&session.removeCover.remove();
    }
  }
  function restoreFormAfterEdit(session){
    var form=session.form;
    form.reset();
    setDateDefaults();
    if(session.kind==='money')updateMoneyCategories();
    applyFormValues(form,session.formValues);
    if(session.kind==='money')updateMoneyCategories();
    if(session.kind==='money')setNamedValue(form,'category',session.formValues.category);
    if(session.kind==='media')showMediaCover(session.pendingCover);
    enhanceDateTime();
    if(session.hadDraft)state.drafts[form.dataset.draft]=copy(session.draft);
    else delete state.drafts[form.dataset.draft];
  }
  function finishRecordEdit(silent){
    if(!editSession)return;
    var session=editSession;
    editSession=null;
    setEditUi(session,false);
    restoreFormAfterEdit(session);
    persistSync(false);
    if(!silent)toast(editText('已取消编辑','Editing cancelled'));
  }
  function startRecordEdit(kind,id){
    var config=EDIT_FORMS[kind],item=findEditableRecord(kind,id);
    if(!config||!item)return;
    if(editSession)finishRecordEdit(true);
    var form=document.getElementById(config.form),draftKey=form.dataset.draft;
    editSession={
      kind:kind,id:String(id),form:form,
      hadDraft:Object.prototype.hasOwnProperty.call(state.drafts,draftKey),
      draft:copy(state.drafts[draftKey]),
      formValues:serializeForm(form),
      pendingCover:pendingMediaCover
    };
    setEditUi(editSession,true);
    form.reset();
    if(kind==='money'){
      setNamedValue(form,'flow',item.data.flow);
      updateMoneyCategories();
    }
    applyFormValues(form,editValues(kind,item));
    if(kind==='money')setNamedValue(form,'category',item.data.category);
    if(kind==='media')showMediaCover(item.cover);
    enhanceDateTime();
    switchView(config.view);
    setTimeout(function(){
      form.scrollIntoView({behavior:'smooth',block:'start'});
      var first=form.querySelector('input:not([type="radio"]):not([type="file"]),select');
      if(first)first.focus();
    },80);
  }
  function editedData(kind,form,item){
    var data=Object.fromEntries(new FormData(form));
    if(kind==='money'){
      if(!(Number(data.amount)>0)){toast('请输入有效金额');return null;}
      return {flow:data.flow,amount:Number(data.amount),category:data.category,note:data.note.trim()};
    }
    if(kind==='fitness'){
      if(!(Number(data.weight)>0)){toast('请记录今天的体重');return null;}
      return {weight:Number(data.weight),bodyFat:data.bodyFat?Number(data.bodyFat):null,
        calories:data.calories===''?null:Number(data.calories),
        duration:data.duration===''?null:Number(data.duration),note:data.note.trim()};
    }
    if(kind==='planner')return {
      title:data.title.trim(),time:data.time,priority:data.priority,list:data.list,
      note:data.note.trim(),remind:data.remind==='1',done:Boolean(item.data.done)
    };
    if(kind==='home')return {
      name:data.name.trim(),quantity:data.quantity.trim(),category:data.category,
      price:Number(data.price||0),priority:data.priority,note:data.note.trim(),
      bought:Boolean(item.data.bought),boughtDate:item.data.boughtDate||null
    };
    return null;
  }
  function submitRecordEdit(event){
    if(!editSession||event.currentTarget!==editSession.form)return;
    event.preventDefault();event.stopImmediatePropagation();
    var session=editSession,item=findEditableRecord(session.kind,session.id);
    if(!item){finishRecordEdit(true);toast(editText('原记录已不存在','The original record no longer exists'));return;}
    var data=Object.fromEntries(new FormData(session.form));
    if(session.kind==='media'){
      item.name=data.name.trim();item.type=data.type;item.status=data.status;
      item.rating=Number(data.rating||0);item.review=data.review.trim();
      item.date=data.date;item.cover=pendingMediaCover;item.sample=false;
    }else{
      var next=editedData(session.kind,session.form,item);if(!next)return;
      item.date=session.kind==='home'?item.date:data.date;
      item.data=next;item.sample=false;
    }
    restoreFormAfterEdit(session);
    if(!saveState(true)){
      applyFormValues(session.form,editValues(session.kind,item));
      if(session.kind==='media')showMediaCover(item.cover);
      return;
    }
    var message=editText(...EDIT_FORMS[session.kind].saved);
    editSession=null;setEditUi(session,false);
    renderAll();toast(message);
  }
  function setupRecordEditing(){
    Object.entries(EDIT_FORMS).forEach(function(entry){
      var form=document.getElementById(entry[1].form);
      form.addEventListener('submit',submitRecordEdit,true);
    });
    document.addEventListener('click',function(event){
      var action=event.target.closest('[data-action]');
      if(!action)return;
      if(action.dataset.action==='edit-record'){
        var kind=action.dataset.kind;
        if(!kind){
          var record=state.records.find(r=>String(r.id)===String(action.dataset.id));
          kind=record&&record.type;
          if(!kind&&state.mediaItems.some(item=>String(item.id)===String(action.dataset.id)))kind='media';
        }
        startRecordEdit(kind,action.dataset.id);
      }
      if(action.dataset.action==='cancel-record-edit')finishRecordEdit(false);
      if(action.dataset.action==='remove-edit-cover'&&editSession&&editSession.kind==='media'){
        showMediaCover('');toast(editText('保存后将移除封面','The cover will be removed when saved'));
      }
    });
  }
