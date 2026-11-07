// IDs and scope only leave this picker. Sheet prices are owned by the server.
export async function mountServicePicker(container,{getSegment,onChange=()=>{},initial={services:[],projects:[]},catalog,groups=['services','projects']}={}){
 if(!catalog){const r=await fetch('/offers/service-catalog.json');if(!r.ok)throw Error('Hizmet listesi yüklenemedi. Yeniden deneyebilirsin.');catalog=await r.json();}
 const state=structuredClone(initial);state.services??=[];state.projects??=[];
 const add=(tag,text,parent,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 const button=(text,parent,fn,cls)=>{const el=add('button',text,parent,cls);el.type='button';el.addEventListener('click',fn);return el;};
 const normalize=text=>String(text).toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
 const views=[];
 container.replaceChildren();
 for(const key of groups){
  const project=key==='projects',title=project?'Tek seferlik projeler':'Aylık hizmetler · Retainer';
  const group=add('fieldset','',container,'ob-service-group');group.dataset.costGroup=key;add('legend',title,group);
  const trigger=button('',group,()=>open(),'ob-service-trigger');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  const selected=add('div','',group,'ob-service-selected');
  const menu=add('div','',group,'ob-service-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','dialog');menu.setAttribute('aria-label',project?'Proje kalemlerini seç':'Aylık maliyet kalemlerini seç');
  const native=typeof menu.showPopover==='function';if(!native)menu.hidden=true;
  const header=add('div','',menu,'ob-service-menu-header');add('strong',title,header);button('Tamam',header,()=>hide(true),'ob-monthly-button');
  const search=add('input','',menu,'ob-service-search');search.type='search';search.placeholder='Kalem adıyla ara…';search.setAttribute('aria-label',project?'Projelerde ara':'Aylık maliyetlerde ara');
  const list=add('div','',menu,'ob-service-options'),empty=add('p','Eşleşen kalem bulunamadı.',menu,'ob-hint');empty.hidden=true;
  const checks=new Map();
  for(const service of catalog[key]){
   const label=add('label','',list,'ob-service-check'),check=add('input','',label);check.type='checkbox';check.value=service.id;check.checked=state[key].some(s=>s.serviceId===service.id);label.append(document.createTextNode(service.name));checks.set(service.id,{label,check,service});
   check.addEventListener('change',()=>{
    if(check.checked)state[key].push({serviceId:service.id,...(project?{quantity:1}:{})});
    else{state[key]=state[key].filter(s=>s.serviceId!==service.id);if(service.id==='influencer')delete state.influencerListAmount;}
    drawSelected();onChange();
   });
  }
  search.addEventListener('input',()=>{const terms=normalize(search.value).split(/\s+/).filter(Boolean);let count=0;for(const {label,service}of checks.values()){const text=normalize(service.name+' '+service.id);label.hidden=!terms.every(term=>text.includes(term));if(!label.hidden)count++;}empty.hidden=count>0;});
  function position(){
   const rect=trigger.getBoundingClientRect(),height=window.visualViewport?.height||window.innerHeight,width=Math.min(520,window.innerWidth-24),maxHeight=Math.min(460,height-24);
   Object.assign(menu.style,{width:width+'px',maxHeight:maxHeight+'px',left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px',top:(rect.bottom+8+maxHeight<=height?rect.bottom+8:Math.max(12,Math.min(rect.top-maxHeight-8,height-maxHeight-12)))+'px'});
  }
  function stopPosition(){window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);}
  function hide(focus=false){stopPosition();if(native){if(menu.matches(':popover-open'))menu.hidePopover();}else{menu.hidden=true;delete menu.dataset.fallbackOpen;}trigger.setAttribute('aria-expanded','false');if(focus&&trigger.isConnected)trigger.focus({preventScroll:true});}
  function open(){
   if(native&&menu.matches(':popover-open')||!native&&!menu.hidden){hide();return;}
   position();if(native)menu.showPopover();else{menu.hidden=false;menu.dataset.fallbackOpen='true';}trigger.setAttribute('aria-expanded','true');search.focus({preventScroll:true});window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);
  }
  menu.addEventListener('toggle',e=>{trigger.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='closed')stopPosition();});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide(true);}});
  if(!native)menu.addEventListener('focusout',()=>queueMicrotask(()=>{if(!menu.contains(document.activeElement)&&document.activeElement!==trigger)hide();}));
  function drawSelected(){
   const expanded=new Set([...selected.querySelectorAll('details[open]')].map(el=>el.dataset.serviceId));selected.replaceChildren();
   trigger.textContent=(project?'Proje kalemi seç':'Aylık maliyet kalemi seç')+' · '+state[key].length+' seçili ⌄';
   if(!state[key].length)add('p',project?'Proje seçilmedi.':'Maliyet seçilmedi. Account ve Growth dahil hiçbir kalem otomatik eklenmez.',selected,'ob-hint ob-service-empty');
   for(const item of state[key]){
    const service=catalog[key].find(s=>s.id===item.serviceId),row=add('div','',selected,'ob-service-row');row.dataset.serviceId=service.id;
    const head=add('div','',row,'ob-monthly-header');add('strong',service.name,head);
    const remove=button('Kaldır',head,()=>{state[key]=state[key].filter(s=>s.serviceId!==service.id);if(service.id==='influencer')delete state.influencerListAmount;checks.get(service.id).check.checked=false;drawSelected();onChange();},'ob-service-remove');remove.setAttribute('aria-label',service.name+' kaldır');
    const custom=service.customSegments.includes(getSegment()),details=add('details','',row,'ob-service-details');details.dataset.serviceId=service.id;details.open=custom||service.id==='influencer'||expanded.has(service.id);add('summary',custom||service.id==='influencer'?'Maliyet ve kapsam bilgileri':'Kapsam ve ayrıntılar',details);
    const detail=add('div','',details,'ob-service-detail-fields'),textLabel=add('label','Kapsam açıklaması (isteğe bağlı)',detail),text=add('input','',textLabel);text.type='text';text.maxLength=240;text.value=item.description||'';text.dataset.description=service.id;text.addEventListener('input',()=>{item.description=text.value;onChange();});
    if(custom){const label=add('label',project?'Projenin gerçek maliyeti · TL':'Aylık gerçek maliyet · TL',detail),field=add('input','',label);field.type='number';field.min='0.01';field.step='0.01';field.value=item.customCost??'';field.dataset.customCost=service.id;field.addEventListener('input',()=>{item.customCost=field.value===''?undefined:Number(field.value);onChange();});add('p','Sheet’te sabit maliyet yok; gerçek maliyeti gir.',detail,'ob-hint');}
    if(['project_static','project_motion'].includes(service.id)){const label=add('label','Adet',detail),field=add('input','',label);field.type='number';field.min='1';field.max='10000';field.step='1';field.value=item.quantity||1;field.dataset.quantity=service.id;field.addEventListener('input',()=>{item.quantity=Number(field.value);onChange();});}
    if(service.id==='influencer'){const label=add('label','Influencer liste bedeli · TL',detail),field=add('input','',label);field.type='number';field.min='0.01';field.step='0.01';field.value=state.influencerListAmount??'';field.dataset.influencer='true';field.addEventListener('input',()=>{state.influencerListAmount=field.value===''?undefined:Number(field.value);onChange();});add('p','Liste bedelinin %10’u hizmet bedelidir; liste bedeli hizmet ücretine eklenmez.',detail,'ob-hint');}
   }
  }
  drawSelected();views.push({drawSelected,hide});
 }
 const money=(v,label)=>{if(!Number.isFinite(v)||v<=0||v>1e10||Math.abs(v*100-Math.round(v*100))>0.00001)throw Error(label+' için sıfırdan büyük, en fazla iki ondalıklı bir maliyet gir.');};
 function getSelection({allowEmpty=false}={}){
  if(!allowEmpty&&!state.services.length&&!state.projects.length)throw Error('En az bir hizmet veya proje seç.');
  const result={services:[],projects:[]};
  for(const key of ['services','projects'])result[key]=state[key].map(item=>{
   const service=catalog[key].find(s=>s.id===item.serviceId),custom=service.customSegments.includes(getSegment());if(custom)money(item.customCost,service.name);
   if(key==='projects'&&(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000))throw Error(service.name+' için geçerli adet gir.');
   return {serviceId:item.serviceId,...(item.description?.trim()?{description:item.description.trim()}:{}),...(key==='projects'?{quantity:item.quantity}:{}),...(custom?{customCost:item.customCost}:{})};
  });
  if(result.services.filter(s=>['webmaster','ecommerce_webmaster','custom_webmaster'].includes(s.serviceId)).length>1)throw Error('Bir webmaster kategorisi seç.');
  if(result.services.some(s=>s.serviceId==='influencer')){money(state.influencerListAmount,'Influencer liste bedeli');result.influencerListAmount=state.influencerListAmount;}
  return result;
 }
 return {getSelection,refresh:()=>views.forEach(v=>v.drawSelected()),snapshot:()=>structuredClone(state),destroy:()=>views.forEach(v=>v.hide())};
}
