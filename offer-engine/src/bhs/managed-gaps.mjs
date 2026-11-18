import {reviewScopedResearch} from './scoped-research.mjs';
import {createHmac} from 'node:crypto';
import {BudgetError,tariff} from '../budget/ledger.mjs';
import {briefHash} from './brief.mjs';
import {capBhsLedger,gapCapKurus} from './managed-budget.mjs';
import {managedIndexInstruction,managedSections,synthesizeManagedReport} from './managed-report.mjs';
import {executeDirectedResearch,planDirectedResearch} from './directed-research.mjs';
import {focusedResearchPlan} from './managed-research.mjs';
import {collectionCorpus,collectionMarket,collectPlannedCoverage,comparisonResearch,managedCollectionContext,peerCandidates,readResearchPages,expandDirectedSources,retainedManagedProofs,scopedRounds,writeScopedSynthesis} from './collection-first.mjs';
import {createEvidenceCollector} from './evidence.mjs';
import {researchHost,researchUrl} from './research-url.mjs';
import {arr,obj,stageModelInput,str} from './sequential-contracts.mjs';
import {salesSectionTitle} from './sales-research-labels.mjs';
import {boundScopedEvidence,mergeScopedEvidence} from './scoped-evidence-index.mjs';

const receiptKey='audit:managed-gap-result';

const indexSchema=obj({observations:arr(obj({area:str(80),text:str(350),sourceIds:arr(str(80))})),organizations:arr(obj({name:str(120),sourceId:str(80)}))});
const unique=values=>[...new Set(values)];
const recoverable=error=>error instanceof BudgetError||['TimeoutError','AbortError'].includes(error.name)||error instanceof TypeError&&error.message==='fetch failed';

function gapRunId(baseId,brief,secret){
 const id=createHmac('sha256',secret).update('bhs-content-gap:'+baseId+':'+briefHash(brief)).digest('hex').slice(0,32);
 return id.slice(0,8)+'-'+id.slice(8,12)+'-4'+id.slice(13,16)+'-8'+id.slice(17,20)+'-'+id.slice(20);
}

export async function resolveManagedGaps({action,brief,synthesis,sections,secret,baseLedger,getGapLedger,getProviders,previous,allowance=true,collect=createEvidenceCollector({timeout:25000,allowPartialPlan:true,hardDeadline:true})}){
 if(synthesis.supervision?.reviewMode!=='managed-audit'||!allowance)return null;
 const researchPlan=synthesis.supervision.researchPlan;
 const separateCosts=researchPlan?.separateGapCosts===true;
 if(separateCosts){
  const saved=synthesis.report.verifiedResearch?.metrics||[];
  // A clipped report can omit an already confirmed measurement. Its evidence
  // stays in the report and offer. Paid completion is for open research only.
  sections=sections.filter(section=>!saved.some(m=>m.section===section)||saved.some(m=>m.section===section&&m.status==='open'));
 }
 const base=await baseLedger.status();
 if(!/^[a-f0-9-]{36}$/i.test(base.id||''))return null;
 const runId=gapRunId(base.id,brief,secret);
 const markerKey='audit:managed-gap-authorization:'+briefHash(brief);
 const authorization=await baseLedger.get(markerKey);
 const independent=researchPlan?.directedResearch===true;
 const remaining=independent?gapCapKurus:Math.max(0,Math.min(gapCapKurus,tariff.capKurus-base.chargedKurus));
 const estimate=separateCosts&&independent?{baseCommittedKurus:base.chargedKurus,maximumCombinedKurus:base.chargedKurus+gapCapKurus}:{};
 const available=(ids,capKurus)=>({available:true,sections:ids.map(id=>salesSectionTitle(id,
  Object.hasOwn(managedSections,id)?managedSections[id]:synthesis.report.bhsSections?.find(s=>s.id===id)?.title)),capKurus,...estimate});
 if(!authorization){
  if(action!=='complete_gaps')return sections.length&&remaining?available(sections,remaining):null;
  if(!sections.length||!remaining)return null;
  await baseLedger.once(markerKey,{runId,sections},0,async()=>({runId,sections,sharedBudget:!independent,directedResearch:independent,baseline:base.chargedKurus,allowance:remaining}));
 }
 const authorized=(authorization||await baseLedger.get(markerKey))?.value;
 if(!authorized||authorized.runId!==runId)throw new BudgetError('completion_unavailable','Ek araştırma yetkisi doğrulanamadı.');
 if(authorized.directedResearch){
  // Only an explicit action can open the independent 30 TL account.
  if(action!=='complete_gaps'&&!(await baseLedger.get(receiptKey+':opened:'+runId)))return available(authorized.sections,gapCapKurus);
  const ledger=await getGapLedger(runId);
  if(action==='complete_gaps'){
   await ledger.begin();
   await baseLedger.once(receiptKey+':opened:'+runId,{runId},0,async()=>({opened:true}));
  }
  const scoped=capBhsLedger(ledger,gapCapKurus);
  let receipt=await ledger.get(receiptKey);
  if(!receipt&&action==='complete_gaps'){
   try{
    await scoped.once(receiptKey,{runId},0,async()=>completeSections({brief,synthesis,sections:authorized.sections,ledger:scoped,
     getProviders,previous,collect,baseline:0,ceiling:gapCapKurus}));
   }catch(error){
    if(!recoverable(error))throw error;
   }
   receipt=await ledger.get(receiptKey);
  }
  const chargedKurus=(await ledger.status()).chargedKurus;
  return {available:false,chargedKurus,capKurus:gapCapKurus,status:receipt?.state||'authorized',...estimate,
   ...(separateCosts?{combinedCommittedKurus:base.chargedKurus+chargedKurus}:{}),
   ...(receipt?.state==='complete'?{synthesis:{...synthesis,...receipt.value}}:{})};
 }
 if(!authorized.sharedBudget){
  // Preserve previously saved results from the retired separate-budget path.
  const ledger=await getGapLedger(runId);
  const receipt=await ledger.get(receiptKey);
  if(!receipt)return null;
  return {available:false,status:receipt.state,chargedKurus:(await ledger.status()).chargedKurus,capKurus:gapCapKurus,
   ...(receipt.state==='complete'?{synthesis:{...synthesis,...receipt.value}}:{})};
 }
 const {baseline,allowance:gapAllowance}=authorized;
 const ceiling=Math.min(tariff.capKurus,baseline+gapAllowance);
 const key=receiptKey+':'+runId;
 const scoped=capBhsLedger(baseLedger,ceiling);
 let receipt=await baseLedger.get(key);
 if(!receipt&&action==='complete_gaps'){
  try{
   await scoped.once(key,{runId},0,async()=>{
    const result=await completeSections({brief,synthesis,sections:authorized.sections,ledger:scoped,getProviders,previous,collect,baseline,ceiling});
    return {report:result.report,analysisPacket:result.analysisPacket,
     supervision:{...synthesis.supervision,gapEvidenceCoverage:result.evidenceCoverage}};
   });
  }catch(error){
   if(error.code!=='budget_pending'&&!(await baseLedger.get(key)))throw error;
  }
  receipt=await baseLedger.get(key);
 }
 const {chargedKurus}=await baseLedger.status();
 return {available:false,chargedKurus:Math.max(0,chargedKurus-baseline),capKurus:gapAllowance,status:receipt?.state||'authorized',
   ...(receipt?.state==='complete'?{synthesis:{...synthesis,...receipt.value}}:{})};
}

async function completeSections({brief,synthesis,sections,ledger,getProviders,previous,collect,baseline,ceiling}){
 const deadline=AbortSignal.timeout(260000);
 const fetchImpl=(url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([deadline,init.signal]):deadline});
 const original=synthesis.report;
 const brand=await previous('brand');
 const priorPlan=synthesis.supervision.researchPlan;
 const version=priorPlan.taskReporting?22:priorPlan.sectionedSynthesis?21:priorPlan.readEvidenceOnly?20:priorPlan.separateGapCosts?18:priorPlan.verifiedResults?17:priorPlan.adaptiveResearch?10:priorPlan.scopedResearch?9:priorPlan.directedResearch?7:priorPlan.tasks?.some(task=>task.tools)?6:5;
 const providers=getProviders({ledger,fetchImpl,phase:'synthesis',researchVersion:'v8',phaseLimitKurus:ceiling,managedAudit:true,managedBudgetVersion:version});
 const scopedNeeds=new Set((original.verifiedResearch?.metrics||[]).filter(m=>sections.includes(m.section)).map(m=>m.id));
 const existing=original.findings.filter(f=>(sections.includes(f.bhsSection)||priorPlan.taskReporting&&f.researchNeedIds?.some(id=>scopedNeeds.has(id)))&&
  f.recommendation?.action&&(version>=7||f.recommendation?.measurement))
  .map(f=>[f.bhsSection,f.statement,f.swotQuadrant||null,f.peerId||null]);
 if(version>=9){
  const rounds=priorPlan.compactQueue?[]:(await Promise.all(scopedRounds.map(phase=>previous(phase)))).filter(r=>r?.scopedRound);
  if(priorPlan.adaptiveResearch)rounds.push(...(await previous('scoped-tail')||[]));
  const readPages=(urls,evidenceFocus)=>readResearchPages(brief,brand.plan,urls,providers,collect,{archive:false,...(priorPlan.readEvidenceOnly?{evidenceFocus}:{})});
  for(let i=0;i<3;i++){
   const round=await reviewScopedResearch({identity:brand.brandUnderstanding,briefUnderstanding:brand.briefUnderstanding,
    plan:priorPlan,rounds,providers,brief,packet:brand.packet,readPages,eligibleSections:sections,existing,gap:true,last:i===2});
   rounds.push(round);
   if(round.approved||round.closed)break;
  }
  const result=await writeScopedSynthesis({brief,brand,plan:priorPlan,rounds,providers,sections,existing});
  if(!result.report.verifiedResearch&&!result.report.findings.some(f=>f.recommendation?.action))return {report:original,analysisPacket:result.analysisPacket,
   supervision:{...synthesis.supervision,reportIssue:result.supervision.reportIssue},evidenceCoverage:result.supervision.evidenceCoverage};
  const context=managedCollectionContext(brief,result.analysisPacket,{complete:priorPlan.readEvidenceOnly,readEvidenceOnly:priorPlan.readEvidenceOnly});
  const merged=mergeGapEvidence(synthesis,result.report,sections,context,result.supervision.evidenceCoverage);
  return {...merged,supervision:{...merged.supervision,researchApproved:result.supervision.researchApproved,metricCoverage:result.supervision.metricCoverage,
   evidenceCoverage:result.supervision.evidenceCoverage,reportIssue:result.supervision.reportIssue}};
 }
 if(version>=7){
  const [priorCorpus,reviewedProofs]=await Promise.all([collectionCorpus(previous),retainedManagedProofs(brief,priorPlan,previous)]);
  const priorRounds=[{pages:priorCorpus.packet.sources,searches:priorCorpus.searches,scrapes:priorCorpus.scrapes}];
  const rounds=[];
  const pool=providers.withCeiling(1800);
  let plan;
  for(let round=0;round<3;round++){
   const next=await planDirectedResearch({brief,brand,providers:pool,plan,rounds,priorRounds,sections,existing});
   if(!plan){
    if(!next.directedResearch)break;
    plan=next;
   }
   const result=await executeDirectedResearch({brief,brand,providers:pool,plan,decision:next,rounds,priorRounds,
    readPages:urls=>readResearchPages(brief,brand.plan,urls,pool,collect,{complete:true}),expandPages:expandDirectedSources});
   rounds.push(result);
   if(!result.commandResults.length&&!next.reason)break;
  }
  if(!plan)return {report:original,analysisPacket:synthesis.analysisPacket};
  const freshSources=rounds.flatMap(r=>r.pages||[]);
  const scrapes=rounds.flatMap(r=>r.scrapes||[]);
  const searches=rounds.flatMap(r=>r.searches||[]);
  const freshCorpus=await collectionCorpus(previous,{pages:freshSources,searches,scrapes,peerHints:rounds.flatMap(r=>r.peerHints||[])});
  const context=managedCollectionContext(brief,freshCorpus.packet,{complete:true});
  const freshUrls=new Set([...freshSources.map(s=>s.finalUrl),...scrapes.flatMap(s=>(s.pages||[]).map(p=>p.url)),...searches.flatMap(s=>(s.results||[]).map(r=>r.url))]);
  const topics={competition:'c',digital:'d',swot:'s',perception:'p',readiness:'r'};
  const retainedProofs=new Map([...reviewedProofs].filter(([,verdict])=>sections.some(section=>topics[section]===verdict)));
  const {commands,...finalPlan}=plan;
  const {report:patch,evidenceCoverage}=await synthesizeManagedReport({brief,brand,plan:{...finalPlan,assets:rounds.at(-1)?.assets||plan.assets,
   questions:rounds.flatMap(r=>r.questions||[])},context,inventory:[],providers,sections,existing,evidenceUrls:freshUrls,retainedProofs,sectional:true,allowPartial:true});
  return mergeGapEvidence(synthesis,patch,sections,context,evidenceCoverage);
 }
 const missingMetrics=synthesis.supervision.metricCoverage?.filter(metric=>sections.includes(metric.section)&&!metric.proofIds.length)||[];
 const planned=(await focusedResearchPlan({brief,sections,priorPlan,findings:existing,missingMetrics,providers})).data;
 const [priorCorpus,reviewedProofs]=await Promise.all([collectionCorpus(previous),retainedManagedProofs(brief,priorPlan,previous)]);
 const topics={competition:'c',digital:'d',swot:'s',perception:'p',readiness:'r'};
 const retainedProofs=new Map([...reviewedProofs].filter(([,verdict])=>sections.some(section=>topics[section]===verdict)));
 const queryKey=query=>query?.trim().toLocaleLowerCase('tr');
 const priorSearches=new Map(priorCorpus.searches.filter(search=>!search.unavailable).map(search=>[queryKey(search.query),search]));
 const tasks=[...new Map(planned.tasks.filter(t=>sections.includes(t.section)).map(task=>[queryKey(task.query),task])).values()];
 const pool=providers.withCeiling(Math.min(ceiling,baseline+1700));
 const searches=[];
 for(let i=0;i<tasks.length;i+=3){
  const batch=await Promise.allSettled(tasks.slice(i,i+3).map(async task=>priorSearches.get(queryKey(task.query))||
   pool.search(task.query,{depth:'basic',maxResults:12,retainRaw:true})));
  for(const result of batch){
   if(result.status==='fulfilled')searches.push(result.value);
   else if(!recoverable(result.reason))throw result.reason;
  }
 }
 const market=collectionMarket(priorPlan.market,brief.goals);
 const knownUrls=new Set(priorCorpus.packet.sources.filter(source=>source.method!=='search-snippet'&&!source.metadataOnly)
  .map(source=>researchUrl(source.finalUrl)));
 const supplemental=version===6&&sections.some(section=>['competition','perception'].includes(section))?await collectPlannedCoverage({brief,brand,
  plan:{...priorPlan,tasks:tasks.map((task,i)=>({...task,id:'gap'+(i+1)})),peerNames:planned.peerNames},market,prior:searches,reserved:pool,collect,existing:[...knownUrls]}):{searches:[],pages:[]};
 searches.push(...supplemental.searches);
 const readUrls=new Set([...knownUrls,...supplemental.pages.map(source=>researchUrl(source.finalUrl))]);
 const urls=unique(searches.flatMap(s=>(s.results||[]).map(r=>researchUrl(r.url))).filter(url=>url&&!readUrls.has(url)));
 const fresh=await readResearchPages(brief,brand.plan,urls,pool,collect);
 fresh.sources.unshift(...supplemental.pages.filter(source=>!knownUrls.has(researchUrl(source.finalUrl))));
 const names=unique(planned.peerNames).filter(name=>!original.competitors.some(peer=>peer.name.toLowerCase()===name.toLowerCase()));
 const collectedUrls=new Set([...knownUrls,...fresh.sources.map(source=>source.finalUrl)]);
 const peers=sections.includes('competition')
  ?await comparisonResearch(brief,brand,null,pool,providers,collect,null,{...priorPlan,peerNames:names},[...priorCorpus.searches,...searches],collectedUrls)
  :{pages:[],peerHints:[]};
 const evidence={...priorCorpus.packet,entities:[...priorCorpus.packet.entities,...peers.peerHints],
  sources:[...priorCorpus.packet.sources,...fresh.sources,...peers.pages],citationCards:[]};
 const context=managedCollectionContext(brief,evidence);
 const candidates=peerCandidates(context,context.input.entities,brand,priorPlan.comparableProduct,true,10);
 context.input.entities=[...context.input.entities.filter(e=>e.role==='brand'),...candidates.map(c=>c.entity)];
 context.peerProofs=new Map(candidates.map(({entity,cards})=>[entity.id,cards.map(card=>card.id)]));
 const newUrls=new Set([...fresh.sources,...peers.pages].map(source=>source.finalUrl));
 let inventory=[];
 if(newUrls.size){
  try{
   inventory=[(await pool.worker('v8-managed-gap-index',{
    instruction:managedIndexInstruction,researchTasks:tasks,
    ...stageModelInput({...context,input:{...context.input,sources:context.input.sources.filter(s=>newUrls.has(s.url))}},{areas:true})
   },indexSchema,{maxOutputTokens:3000})).data];
  }catch(error){if(!recoverable(error))throw error;}
 }
 const {report:patch,evidenceCoverage}=await synthesizeManagedReport({brief,brand,plan:{...priorPlan,coveragePolicy:2},context,inventory,providers,sections,existing,evidenceUrls:newUrls,retainedProofs,sectional:true,allowPartial:true});
 return mergeGapEvidence(synthesis,patch,sections,context,evidenceCoverage);
}

function mergeGapEvidence(synthesis,patch,sections,context,evidenceCoverage){
 const report=mergeManagedGapReport(synthesis.report,patch,sections,{taskReporting:synthesis.supervision?.researchPlan?.taskReporting});
 const cited=new Set(report.sources.map(s=>s.url));
 const priorPacket=synthesis.analysisPacket;
 return {report,evidenceCoverage,supervision:{...synthesis.supervision,gapEvidenceCoverage:evidenceCoverage},analysisPacket:{...context.packet,
  sources:[...new Map([...priorPacket.sources,...context.packet.sources].filter(s=>cited.has(s.finalUrl||s.url)).map(s=>[(s.finalUrl||s.url)+' '+s.contentHash,s])).values()],
  citationCards:[...new Map([...(priorPacket.citationCards||[]),...context.packet.citationCards].filter(s=>cited.has(s.url)).map(s=>[s.id,s])).values()]}};
}

export function mergeManagedGapReport(original,patch,sections,{taskReporting=false}={}){
 const verified=Boolean(original.verifiedResearch&&patch.verifiedResearch);
 const metrics=new Map((original.verifiedResearch?.metrics||[]).map(m=>[m.id,{...m}]));
 if(verified)for(const metric of patch.verifiedResearch.metrics)if(sections.includes(metric.section)){
  const prior=metrics.get(metric.id);
  const evidence=mergeScopedEvidence(prior?.evidence,metric.evidence);
  metrics.set(metric.id,evidence.length||prior?.additionalEvidence?{...metric,evidence,...(prior?.additionalEvidence?{additionalEvidence:true}:{})}:metric);
 }
 const evidenceRefs=new Set([...metrics.values()].flatMap(m=>[...m.sourceIds,...(m.marketMeasures||[]).flatMap(row=>row.sourceIds)]));
 const eligibleNeeds=new Set((patch.verifiedResearch?.metrics||[]).filter(m=>sections.includes(m.section)).map(m=>m.id));
 const acceptedPeers=new Set(original.competitors.map(peer=>peer.website));
 const peerCandidates=new Map(patch.competitors.filter(peer=>!acceptedPeers.has(peer.website)).map(peer=>[peer.id,peer]));
 const statementKey=f=>[taskReporting?'':f.bhsSection,f.swotQuadrant||'',f.peerId||'',f.statement.trim().toLocaleLowerCase('tr')].join('\0');
 const existingStatements=new Set(original.findings.map(statementKey));
 const findings=[...original.findings];
 const competitors=[...original.competitors];
 for(const f of patch.findings){
  const key=statementKey(f),peer=peerCandidates.get(f.peerId);
  const existingPeer=verified&&competitors.some(p=>p.id===f.peerId);
  const inScope=sections.includes(f.bhsSection)||taskReporting&&f.researchNeedIds?.some(id=>eligibleNeeds.has(id));
  if(!inScope||existingStatements.has(key)||f.peerId&&!existingPeer&&(!peer||acceptedPeers.has(peer.website)||competitors.length>=10))continue;
  const count=findings.filter(prior=>prior.bhsSection===f.bhsSection).length;
  if(!taskReporting&&count>=10)continue;
  findings.push({...f,bhsRank:count+1});
  existingStatements.add(key);
  if(peer&&!acceptedPeers.has(peer.website)){competitors.push(peer);acceptedPeers.add(peer.website);}
 }
 if(verified){
  const competitionRefs=new Set(patch.verifiedResearch.metrics.filter(m=>m.requiresPeer&&sections.includes(m.section)).flatMap(m=>m.sourceIds));
  for(const peer of peerCandidates.values())if(!acceptedPeers.has(peer.website)&&peer.sourceIds.some(id=>competitionRefs.has(id))){
   competitors.push(peer);acceptedPeers.add(peer.website);
  }
 }
 const addedIds=new Set(findings.slice(original.findings.length).map(f=>f.id));
 const sourceIds=new Set([...evidenceRefs,...[...findings,...competitors].flatMap(f=>f.sourceIds)]);
 const keyForComparison=row=>JSON.stringify([row.reference.url,row.candidate.url]);
 const comparisons=new Map((original.verifiedResearch?.productComparisons||[]).map(row=>[keyForComparison(row),row]));
 if(verified)for(const row of patch.verifiedResearch.productComparisons||[]){
  if(!eligibleNeeds.has(row.referenceNeedId)&&!eligibleNeeds.has(row.candidateNeedId)&&
   !row.fields.some(field=>eligibleNeeds.has(field.reference?.needId)||eligibleNeeds.has(field.candidate?.needId)))continue;
  const prior=comparisons.get(keyForComparison(row));
  if(!prior){comparisons.set(keyForComparison(row),row);continue;}
  const priorFields=new Map(prior.fields.map(field=>[field.key,field]));
  comparisons.set(keyForComparison(row),{...row,fields:row.fields.map(field=>({...field,
   reference:field.reference??priorFields.get(field.key)?.reference??null,candidate:field.candidate??priorFields.get(field.key)?.candidate??null}))});
 }
 for(const row of comparisons.values())for(const item of [row.reference,row.candidate,...row.fields.flatMap(field=>[field.reference,field.candidate])])
  for(const id of item?.sourceIds||[])sourceIds.add(id);
 const acceptedHosts=new Set(competitors.map(peer=>researchHost(peer.website)));
 const candidates=[...new Map([...(original.verifiedResearch?.competitorCandidates||[]),...(patch.verifiedResearch?.competitorCandidates||[])]
  .filter(candidate=>!acceptedHosts.has(researchHost(candidate.url))).map(candidate=>[researchHost(candidate.url),candidate])).values()];
 const directProducts=new Set([...comparisons.values()].map(row=>row.candidate.url));
 const indirect=[...new Map([...(original.verifiedResearch?.indirectAlternatives||[]),...(patch.verifiedResearch?.indirectAlternatives||[])]
  .filter(item=>!directProducts.has(item.url)).map(item=>[item.url,item])).values()];
 return {...original,findings,competitors,
  ...(verified?{verifiedResearch:{metrics:boundScopedEvidence([...metrics.values()]),...(candidates.length?{competitorCandidates:candidates}:{}),
   ...(comparisons.size?{productComparisons:[...comparisons.values()]}:{}),...(indirect.length?{indirectAlternatives:indirect}:{})}}:{}),
  sources:[...new Map([...original.sources,...patch.sources.filter(s=>sourceIds.has(s.id))].map(s=>[s.id,s])).values()],
  meetingQuestions:[...original.meetingQuestions,...patch.meetingQuestions.filter(q=>q.findingIds.some(id=>addedIds.has(id)))],
  dimensions:original.dimensions.map(d=>({...d,findingIds:[...d.findingIds,...findings.filter(f=>addedIds.has(f.id)&&f.dimension===d.id).map(f=>f.id)]}))};
}
