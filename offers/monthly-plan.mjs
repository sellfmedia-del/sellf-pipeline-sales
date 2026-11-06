import {mountServicePicker} from './service-picker.mjs';
export async function mountMonthlyEditor(container,{getSegment,onChange=()=>{}}){
 const response=await fetch('/offers/service-catalog.json');if(!response.ok)throw Error('Hizmet listesi yüklenemedi. Yeniden deneyebilirsin.');
 const catalog=await response.json();let months=[{month:1,services:[],projects:[]}],pickers=[];
 const add=(tag,text,parent,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
 const button=(text,parent,action)=>{const el=add('button',text,parent,'ob-monthly-button');el.type='button';el.addEventListener('click',action);return el;};
 const snapshot=()=>{months=months.map((row,i)=>({month:row.month,...pickers[i].snapshot()}));};
 async function draw(){
  container.replaceChildren();pickers=[];const cards=add('div','',container,'ob-monthly-cards');
  for(const [index,row]of months.entries()){
   const card=add('section','',cards,'ob-monthly-card');card.dataset.month=row.month;
   const header=add('div','',card,'ob-monthly-header');add('h4',row.month+'. ay',header);
   if(index)button('Önceki ayın retainer hizmetlerini kopyala',header,async()=>{snapshot();const previous=structuredClone(months[index-1]);months[index]={month:row.month,services:previous.services,projects:[],...(previous.influencerListAmount!==undefined?{influencerListAmount:previous.influencerListAmount}:{})};await draw();onChange();});
   const host=add('div','',card);pickers.push(await mountServicePicker(host,{getSegment,catalog,initial:row,onChange}));
  }
  const actions=add('div','',container,'ob-monthly-actions');
  const more=button('Ay ekle',actions,async()=>{snapshot();months.push({month:months.length+1,services:[],projects:[]});await draw();onChange();});more.disabled=months.length===36;
  if(months.length>1)button('Son ayı kaldır',actions,async()=>{snapshot();months.pop();await draw();onChange();});
 }
 await draw();return {getPlan:()=>({months:pickers.map((picker,i)=>{try{return {month:i+1,...picker.getSelection()};}catch(error){throw Error((i+1)+'. ay · '+error.message);}})}),refresh:async()=>{snapshot();await draw();}};
}
