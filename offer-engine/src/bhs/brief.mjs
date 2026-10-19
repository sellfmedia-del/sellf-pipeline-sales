import {createHash} from 'node:crypto';
import {resolveTarget} from '../network.mjs';

export const dimensions=Object.freeze([
  {id:'financial',name:'Finansal Sağlık Sinyalleri',weight:.25},
  {id:'operations',name:'Operasyonel Verimlilik Sinyalleri',weight:.20},
  {id:'funnel',name:'Funnel Bütünlüğü',weight:.20},
  {id:'digital',name:'Dijital Varlık Sağlığı',weight:.15},
  {id:'perception',name:'Marka Algısı',weight:.10},
  {id:'competition',name:'Rekabetçi Pozisyon',weight:.10}
]);
export function snapshotBrief(input){
  const result={};
  for(const [key,limit] of Object.entries({brandName:200,segment:30,website:2048,goals:10000,needs:10000,services:10000,meetingNotes:30000})){
    if(typeof input?.[key]!=='string'||input[key].length>limit)throw Error('Brief alanı geçersiz: '+key);
    result[key]=input[key].trim();
  }
  for(const key of ['brandName','goals','needs','services'])if(!result[key])throw Error('Brief alanı gerekli: '+key);
  if(!['kobi','corporate','key_account'].includes(result.segment))throw Error('Brief segmenti geçersiz.');
  const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(result.website)?result.website:'https://'+result.website);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.'))throw Error('Brief web sitesi geçersiz.');
  url.hash='';result.website=url.href;
  const budget=input.budget;
  if(budget!==undefined&&budget!==''&&(!Number.isFinite(Number(budget))||Number(budget)<0))throw Error('Brief bütçesi geçersiz.');
  result.budget=budget===undefined||budget===''?null:Number(budget);
  // Do not send the lead object, contact details, logo, CRM IDs or credentials.
  return result;
}
export const briefHash=brief=>createHash('sha256').update(JSON.stringify(brief)).digest('hex');
export async function validatePublicBrief(brief){await resolveTarget(brief.website);return brief;}
