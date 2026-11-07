import {mountServicePicker} from './service-picker.mjs';
export async function mountStandardEditor(container,{getSegment,onChange=()=>{}}){
 const response=await fetch('/offers/service-catalog.json');if(!response.ok)throw Error('Maliyet listesi yüklenemedi. Yeniden deneyebilirsin.');const catalog=await response.json();
 container.replaceChildren();const alternatives=[{id:'growth_operations',name:'Growth + Operasyon'},{id:'operations_bundle',name:'Operasyon Paketi'}],pickers=[],hosts=[];
 for(const [i,option]of alternatives.entries()){
  const section=document.createElement('section');section.className='ob-alternative-costs';section.dataset.alternative=option.id;const heading=document.createElement('h4');heading.textContent=option.name;section.append(heading);
  if(i){const copy=document.createElement('button');copy.type='button';copy.className='ob-monthly-button';copy.textContent='İlk alternatifin maliyetlerini kopyala';copy.addEventListener('click',async()=>{pickers[1]?.destroy();pickers[1]=await mountServicePicker(hosts[1],{getSegment,onChange,catalog,groups:['services'],initial:pickers[0].snapshot()});onChange();});section.append(copy);}
  const host=document.createElement('div');section.append(host);container.append(section);hosts.push(host);pickers.push(await mountServicePicker(host,{getSegment,onChange,catalog,groups:['services']}));
 }
 const projectHost=document.createElement('div');container.append(projectHost);const projectPicker=await mountServicePicker(projectHost,{getSegment,onChange,catalog,groups:['projects']});
 return {getSelection(){const rows=pickers.map((picker,i)=>{const selected=picker.getSelection({allowEmpty:true});return {id:alternatives[i].id,services:selected.services,...(selected.influencerListAmount!==undefined?{influencerListAmount:selected.influencerListAmount}:{})};}),projects=projectPicker.getSelection({allowEmpty:true}).projects;if(rows.every(r=>!r.services.length)&&!projects.length)throw Error('En az bir hizmet veya proje seç.');return {alternatives:rows,projects};},refresh:()=>{for(const p of pickers)p.refresh();projectPicker.refresh();},destroy:()=>{for(const p of pickers)p.destroy();projectPicker.destroy();}};
}
