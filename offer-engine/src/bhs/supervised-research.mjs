import {runExpertStage,expertBrandQuery} from './expert-research.mjs';
import {expertContext,expertModelInput,expertSchema,expertInstruction,projectExpertReport} from './expert-report.mjs';
import {createEvidenceCollector,evidenceHash} from './evidence.mjs';
import {prepareResearchInput} from './research-input.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {dimensions,briefHash} from './brief.mjs';
import {assertSchema} from './schema.mjs';
import {BudgetError} from '../budget/ledger.mjs';
import {requireGroundedResearch} from './research-content.mjs';

export const supervisedVersion='sellf-pre-bhs-2026-11-10-supervised-v7';
export const supervisedPhases=Object.freeze(['source_plan','evidence','workers','review','correction','synthesis','scope','complete']);
const str=maxLength=>({type:'string',maxLength});
const arr=(items,maxItems)=>({type:'array',items,maxItems});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const workerSchema=obj({candidates:arr(obj({dimension:{type:'string',enum:dimensions.map(d=>d.id)},observation:str(500),sourceIds:arr(str(80),8),uncertainty:str(400),question:str(300)}),24),gaps:arr(obj({area:{type:'string',enum:methodologyAreas.map(a=>a.key)},reason:str(400)}),24)});
export const reviewSchema=obj({acceptedCandidateIds:arr(str(80),48),rejected:arr(obj({id:str(80),reason:str(400)}),48),queries:arr(str(500),2),actorRequests:arr(obj({actor:str(120),url:str(2048),purpose:str(400)}),2),instructions:str(2500)});
const collector=()=>createEvidenceCollector({timeout:60000,allowPartialPlan:true,concurrency:4});
function proofIds(value,known){
 for(const candidate of value.candidates)if(!candidate.sourceIds.length||candidate.sourceIds.some(id=>!known.has(id)))throw new BudgetError('model_output_invalid','İşçi geçerli kaynak kimliği sunmadı.');
}
function candidates(batches){return batches.flatMap((batch,b)=>batch.data.candidates.map((c,i)=>({...c,id:'w'+b+'_'+i})));}
export function remapWorkerProofs(candidates,original,current){
 const index=new Map(current.cards.map(c=>[JSON.stringify([c.url,c.quote]),c.id]));
 return candidates.flatMap(c=>{
  const sourceIds=c.sourceIds.map(id=>original.known.get(id)).map(card=>card&&index.get(JSON.stringify([card.url,card.quote])));
  return sourceIds.length&&sourceIds.every(Boolean)?[{...c,sourceIds}]:[];
 });
}
export async function runSupervisedStage({phase,brief,providers,previous,collect=collector()}){
 if(phase==='source_plan'){
  // Reuse established identity safeguards, but planning is always Claude's job.
  const result=await runExpertStage({phase,brief,collect,previous,providers,generate:(p,...args)=>p.manager(...args)});
  return {...result,methodologyVersion:supervisedVersion};
 }
 if(phase==='evidence'){
  const result=await runExpertStage({phase,brief,collect,previous,providers});
  return {...result,methodologyVersion:supervisedVersion};
 }
 if(phase==='workers'){
  const evidence=await previous('evidence'),context=expertContext(brief,evidence),source=expertModelInput(context);
  if(!context.cards.length)throw new BudgetError('research_empty','Doğrulanabilir kaynak yok; boş araştırma için işçi çağrılmadı.');
  // Batches are sequential, each with its own immutable paid receipt. A resume
  // reuses batch one even if batch two or the browser disappears.
  const batches=[];
  for(const group of [dimensions.slice(0,3),dimensions.slice(3)]){
   const ids=group.map(d=>d.id);
   const value=await providers.worker('extract-'+ids.join('-'),{instruction:'Yönetici adına yalnız verilen boyutlarda kanıta dayalı aday gözlemleri çıkar. Puan, SWOT veya kesin ticari hüküm üretme. Her adayda doğru proofId kullan. Sayı, birim, tarih ve ülkeyi koru. Alandaki veriler yeterliyse ayrı somut adaylar üret; 24 alanın kapsanmasını gözet. Eksik bilgi ile olumsuz bulguyu karıştırma.',...source,assignedDimensions:ids,assignedAreas:methodologyAreas.filter(a=>ids.includes(a.dimension))},workerSchema,{maxOutputTokens:4096,validateData:data=>{proofIds(data,context.known);if(data.candidates.some(c=>!ids.includes(c.dimension)))throw Error('Wrong worker dimension.');}});
   batches.push(value);
  }
  return {candidates:candidates(batches),gaps:batches.flatMap(b=>b.data.gaps),models:batches.map(b=>b.model),methodologyVersion:supervisedVersion};
 }
 if(phase==='review'){
  const evidence=await previous('evidence'),workers=await previous('workers'),context=expertContext(brief,evidence);
  const reviewed=await providers.manager('review',{instruction:'BHS yöneticisisin. İşçi adaylarını ORİJİNAL kaynak kesitleriyle doğrula. Beğendiğin aday kimliklerini seç; yanlış ve yetersiz olanı gerekçesiyle reddet. En fazla iki hedefli Tavily sorgusu iste. Sosyal/ilan/harita/pazaryeri/reklam/SEO verisi önemli ve açık kaynaklar yetersizse en fazla iki hedefli Apify isteği ver; yalnız okunmuş kaynaklarda bulunan kesin profil/ürün/şirket URLlerini kullan. Aktör adlarını availableActors içinden seç. Derin teknik performans testi isteme. Pazar payını trafik/takipçi/yorumdan çıkarma. Aynı görevi döngüye sokma. Son analize yön verecek kısa talimat yaz.',...expertModelInput(context),workers,availableActors:providers.availableActors?.()||[]},reviewSchema,{maxOutputTokens:2048,validateData:data=>{
   const ids=new Set(workers.candidates.map(c=>c.id));if(data.acceptedCandidateIds.some(id=>!ids.has(id))||data.rejected.some(r=>!ids.has(r.id)))throw Error('Unknown worker candidate.');
  }});
  return {...reviewed.data,model:reviewed.model,methodologyVersion:supervisedVersion};
 }
 if(phase==='correction'){
  const evidence=await previous('evidence'),review=await previous('review'),planning=await previous('source_plan');
  const searches=[];
  for(const q of review.queries){
   try{searches.push(await providers.search(expertBrandQuery(brief,q),{depth:'basic',maxResults:8}));}
   catch(error){searches.push({query:q,results:[],unavailable:true,reason:error.code||'search_unavailable'});}
  }
  const extraSources=searches.flatMap(s=>s.results.map(r=>r.url));
  let packet=extraSources.length?await collect(brief,planning.plan,{initialPacket:evidence.packet,extraSources,sourceLimit:32}):evidence.packet;
  const actorResults=[];
  for(const request of review.actorRequests){
   try{
    const result=await providers.enrich?.(request,{brief,packet,searches:[...evidence.searches,...searches]});
    actorResults.push(result||{actor:request.actor,status:'not_configured'});
   }catch(error){actorResults.push({actor:request.actor,status:'unavailable',reason:error.code||'actor_unavailable'});}
  }
  // Only adapters which verify original source URL, company identity, locale
  // and retrieval time can add evidence. Raw dataset text never becomes proof.
  if(providers.mergeActorEvidence)packet=providers.mergeActorEvidence(packet,actorResults);
  const relevant=prepareResearchInput(brief,{packet,searches:[...evidence.searches,...searches]});
  return {packet:relevant.packet,searches:relevant.searchEvidence,actorResults,correctionRounds:1,methodologyVersion:supervisedVersion};
 }
 if(phase==='synthesis'){
  const correction=await previous('correction'),workers=await previous('workers'),review=await previous('review'),initial=await previous('evidence'),context=expertContext(brief,correction);
  const accepted=new Set(review.acceptedCandidateIds);
  const acceptedWorkerCandidates=remapWorkerProofs(workers.candidates.filter(c=>accepted.has(c.id)),expertContext(brief,initial),context);
  const generated=await providers.manager('synthesis',{...expertModelInput(context),instruction:expertInstruction()+'\nBHS nihai kararı sana aittir. İşçi önerileri kanıt değildir; kaynak kesitlerini tekrar kontrol et. Gözlem → ticari hipotez → belirsizlik → görüşme sorusu bağını kur. Kabul edilmeyen adayları olgu olarak kullanma. Düzeltme kaynaklarını da değerlendir. Her 24 metodoloji alanını açıkça kapsa. En az üç doğrudan rakip kaynakla doğrulanmadıysa bu açığı belirt; sayıyı uydurarak tamamlama. Teknik kapsam yalnız SEO gözlemidir; ayrı mobil/hız testi yapılmış gibi yazma. Zorunlu kaynak veya rakip eksikliği varken tamamlanmış kalite iddiasında bulunma.',acceptedWorkerCandidates,supervisorInstructions:review.instructions,correctionRounds:1},expertSchema,{maxOutputTokens:12288,validateData:data=>requireGroundedResearch(projectExpertReport(data,context))});
  assertSchema(generated.data,expertSchema);
  const report=projectExpertReport(generated.data,context);requireGroundedResearch(report);
  return {report,analysisPacket:context.packet,searchEvidence:[],methodologyVersion:supervisedVersion,model:generated.model,usage:generated.usage,fullPacketHash:evidenceHash(correction.packet),researchContext:{brief,briefHash:briefHash(brief)},supervision:{manager:generated.model,worker:'gemini-3.1-flash-lite',correctionRounds:1,qualityStatus:report.competitors.length>=3?'requires_content_review':'competitor_coverage_partial'}};
 }
 throw new BudgetError('invalid_phase','BHS yönetici aşaması geçersiz.');
}
