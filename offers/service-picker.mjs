// Browser sends IDs only; catalogue costs are owned by the server.
export async function mountServicePicker(container,{getSegment,onChange=()=>{},initial={services:[],projects:[]},catalog}={}){
 if(!catalog){const r=await fetch('/offers/service-catalog.json');if(!r.ok)throw Error('Hizmet listesi yüklenemedi. Yeniden deneyebilirsin.');catalog=await r.json();}
 const state=structuredClone(initial);state.services??=[];state.projects??=[];
 const add=(tag,text,parent,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 function draw(focusId){
  container.replaceChildren();
  for(const [key,title]of [['services','Aylık hizmetler · Retainer'],['projects','Tek seferlik projeler']]){
   const group=add('fieldset','',container,'ob-service-group');add('legend',title,group);
   if(key==='projects')add('p','İşaretlediğin projeler ayrıca tek seferlik fiyatlandırılır; aylık retainer’a eklenmez.',group,'ob-hint');
   for(const service of catalog[key]){
    const box=add('div','',group,'ob-service-choice');box.dataset.serviceId=service.id;
    const label=add('label','',box,'ob-service-check'),check=add('input','',label);check.type='checkbox';check.value=service.id;check.checked=state[key].some(s=>s.serviceId===service.id);label.append(document.createTextNode(service.name));
    check.addEventListener('change',()=>{if(check.checked)state[key].push({serviceId:service.id,...(key==='projects'?{quantity:1}:{})});else{state[key]=state[key].filter(s=>s.serviceId!==service.id);if(service.id==='influencer')delete state.influencerListAmount;}draw(service.id);onChange();});
    const item=state[key].find(s=>s.serviceId===service.id);if(!item)continue;
    const detail=add('div','',box,'ob-service-details');
    const textLabel=add('label','Kapsam açıklaması (isteğe bağlı)',detail),text=add('input','',textLabel);text.type='text';text.maxLength=240;text.value=item.description||'';text.dataset.description=service.id;text.addEventListener('input',()=>{item.description=text.value;onChange();});
    if(service.customSegments.includes(getSegment())){
     const costLabel=add('label',key==='projects'?'Projenin gerçek maliyeti · TL':'Aylık gerçek maliyet · TL',detail),field=add('input','',costLabel);field.type='number';field.min='0.01';field.step='0.01';field.value=item.customCost??'';field.dataset.customCost=service.id;field.addEventListener('input',()=>{item.customCost=field.value===''?undefined:Number(field.value);onChange();});
     add('p','Sheet’te sabit maliyet yok; kapsamına ait gerçek maliyeti gir.',detail,'ob-hint');
    }
    if(['project_static','project_motion'].includes(service.id)){
     const qLabel=add('label','Adet',detail),field=add('input','',qLabel);field.type='number';field.min='1';field.max='10000';field.step='1';field.value=item.quantity||1;field.dataset.quantity=service.id;field.addEventListener('input',()=>{item.quantity=Number(field.value);onChange();});
    }
    if(service.id==='influencer'){
     const listLabel=add('label','Influencer liste bedeli · TL',detail),field=add('input','',listLabel);field.type='number';field.min='0.01';field.step='0.01';field.value=state.influencerListAmount??'';field.dataset.influencer='true';field.addEventListener('input',()=>{state.influencerListAmount=field.value===''?undefined:Number(field.value);onChange();});
     add('p','Liste bedelinin %10’u hizmet bedelidir. Liste bedeli retainer’a eklenmez.',detail,'ob-hint');
    }
   }
  }
  if(focusId)container.querySelector('input[type=checkbox][value="'+focusId+'"]')?.focus({preventScroll:true});
 }
 const money=(v,label)=>{if(!Number.isFinite(v)||v<=0||v>1e10||Math.abs(v*100-Math.round(v*100))>0.00001)throw Error(label+' için sıfırdan büyük, en fazla iki ondalıklı bir maliyet gir.');};
 function getSelection(){
  if(!state.services.length&&!state.projects.length)throw Error('En az bir hizmet veya proje seç.');
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
 draw();return {getSelection,refresh:draw,snapshot:()=>structuredClone(state)};
}
