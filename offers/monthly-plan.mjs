// Operator-only month selection. Fixed prices never come from the browser.
import {interpretOperations} from './service-interpretation.mjs';
export async function mountMonthlyEditor(container,{getSegment,getContext=()=>'',onChange=()=>{}}){
 const response=await fetch('/offers/monthly-catalog.json');
 if(!response.ok)throw Error('Operasyon listesi yüklenemedi. Ay bazlı seçeneği kapatıp yeniden açarak tekrar dene.');
 const catalog=await response.json();
 let months=[{month:1,services:[]}];
 const add=(tag,text,parent,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 function button(text,parent,action){const b=add('button',text,parent,'ob-monthly-button');b.type='button';b.addEventListener('click',action);return b;}
 function draw(){
  container.replaceChildren();
  const cards=add('div','',container,'ob-monthly-cards');
  for(const [index,row]of months.entries()){
   const card=add('section','',cards,'ob-monthly-card');card.dataset.month=row.month;
   const header=add('div','',card,'ob-monthly-header');add('h4',row.month+'. ay',header);
   if(index)button('Önceki aydan kopyala',header,()=>{months[index]={...structuredClone(months[index-1]),month:row.month};draw();onChange();});
   const textLabel=add('label','Hizmetleri yazarak ekle',card),text=add('textarea','',textLabel);text.maxLength=2000;text.rows=2;text.value=row.operationsText||'';text.setAttribute('aria-label',row.month+'. ay hizmetleri yaz');text.placeholder='Örn. dijital reklamlar, sosyal medya yönetimi veya reklam danışmanlığı';
   text.addEventListener('input',()=>{row.operationsText=text.value;row.interpretationNote='';onChange();});
   const apply=()=>{if(applyText(row)){draw();onChange();}else draw();};
   button('Metinden ekle',card,apply);
   button('Metni temizle',card,()=>{row.operationsText='';row.interpretationNote='Operasyonları listeden seçerek devam edebilirsin.';draw();onChange();});
   text.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();apply();}});
   const note=add('p',row.interpretationNote||'Yorumlanan operasyonlar aşağıda görünür. İstersen listeden ekleyip kaldırabilirsin.',card,'ob-hint ob-interpretation');note.setAttribute('role','status');
   row.services.forEach((item,i)=>{
    const service=catalog.find(s=>s.id===item.serviceId),box=add('div','',card,'ob-monthly-service');
    const title=add('div','',box,'ob-monthly-header');add('strong',service.name,title);
    const remove=button('Kaldır',title,()=>{row.services.splice(i,1);if(service.id==='influencer')delete row.influencerListAmount;draw();onChange();});remove.setAttribute('aria-label',row.month+'. ay · '+service.name+' kaldır');
    const detail=add('label','Kapsam açıklaması (isteğe bağlı)',box),input=add('input','',detail);input.type='text';input.maxLength=240;input.value=item.description||'';input.placeholder='Örn. website kurulumu veya brandbook kapsamı';input.dataset.description=service.id;
    input.addEventListener('input',()=>{item.description=input.value;onChange();});
    if(service.customSegments.includes(getSegment())){
     const label=add('label','Bu operasyonun maliyeti · TL',box),field=add('input','',label);field.type='number';field.min='0.01';field.step='0.01';field.value=item.customCost??'';field.dataset.customCost=service.id;
     field.addEventListener('input',()=>{item.customCost=field.value===''?undefined:Number(field.value);onChange();});
     add('p','Bu segmentte sheet’te maliyet bulunmuyor; fiyat hesaplamak için gerçek maliyeti gir.',box,'ob-hint');
    }
    if(service.id==='influencer'){
     const label=add('label','Influencer liste bedeli · TL',box),field=add('input','',label);field.type='number';field.min='0.01';field.step='0.01';field.value=row.influencerListAmount??'';field.dataset.influencer='true';
     field.addEventListener('input',()=>{row.influencerListAmount=field.value===''?undefined:Number(field.value);onChange();});
     add('p','Mevcut %10 hizmet bedeli kuralı uygulanır; liste bedeli Sellf hizmet ücretine eklenmez.',box,'ob-hint');
    }
   });
   const label=add('label','Operasyon ekle',card),select=add('select','',label);select.setAttribute('aria-label',row.month+'. ay operasyon ekle');add('option','Operasyon seç',select).value='';
   for(const service of catalog.filter(s=>!row.services.some(item=>item.serviceId===s.id)))add('option',service.name,select).value=service.id;
   select.addEventListener('change',()=>{if(!select.value)return;row.services.push({serviceId:select.value});draw();onChange();});
  }
  const actions=add('div','',container,'ob-monthly-actions');
  const more=button('Ay ekle',actions,()=>{months.push({month:months.length+1,services:[]});draw();onChange();});more.disabled=months.length===36;
  if(months.length>1)button('Son ayı kaldır',actions,()=>{months.pop();draw();onChange();});
 }
 function applyText(row){
  if(!row.operationsText?.trim())return true;
  const result=interpretOperations(row.operationsText,{context:getContext()});
  if(result.unresolved.length){row.interpretationNote=result.unresolved.join(' ');return false;}
  for(const serviceId of result.serviceIds)if(catalog.some(s=>s.id===serviceId)&&!row.services.some(s=>s.serviceId===serviceId))row.services.push({serviceId});
  row.interpretationNote=result.notes.join(' ')||'Eklendi: '+result.serviceIds.map(id=>catalog.find(s=>s.id===id).name).join(' · ');
  row.operationsText='';return true;
 }
 function getPlan(){
  for(const row of months)if(!applyText(row)){draw();throw Error(row.month+'. ay · '+row.interpretationNote);}
  return {months:months.map(row=>({month:row.month,services:row.services.map(item=>{
   const service=catalog.find(s=>s.id===item.serviceId);
   if(service.customSegments.includes(getSegment())&&!(item.customCost>0))throw Error(row.month+'. ay · '+service.name+' için gerçek maliyeti gir.');
   return {serviceId:item.serviceId,...(item.description?.trim()?{description:item.description.trim()}:{}),...(service.customSegments.includes(getSegment())?{customCost:item.customCost}:{})};
  }),...(row.services.some(s=>s.serviceId==='influencer')?{influencerListAmount:row.influencerListAmount}:{})}))};
 }
 function validate(){
  const plan=getPlan();
  for(const row of plan.months){
   if(!row.services.length)throw Error(row.month+'. ay için en az bir operasyon seç.');
   if(row.services.filter(s=>['webmaster','ecommerce_webmaster','custom_webmaster'].includes(s.serviceId)).length>1)throw Error(row.month+'. ay için bir webmaster kategorisi seç.');
   if(row.services.some(s=>s.serviceId==='influencer')&&!(row.influencerListAmount>0))throw Error(row.month+'. ay influencer liste bedelini gir.');
  }
  return plan;
 }
 draw();return {getPlan:validate,refresh:draw};
}
