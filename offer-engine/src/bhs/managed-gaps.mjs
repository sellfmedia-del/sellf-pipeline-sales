import {createHmac} from 'node:crypto';
import {BudgetError,tariff} from '../budget/ledger.mjs';
import {briefHash} from './brief.mjs';
import {capBhsLedger,gapCapKurus} from './managed-budget.mjs';
import {managedIndexInstruction,managedSections,synthesizeManagedReport} from './managed-report.mjs';
import {focusedResearchPlan} from './managed-research.mjs';
import {collectionCorpus,comparisonResearch,managedCollectionContext,peerCandidates,readResearchPages,retainedManagedProofs} from './collection-first.mjs';
import {createEvidenceCollector} from './evidence.mjs';
import {researchUrl} from './research-url.mjs';
import {arr,obj,stageModelInput,str} from './sequential-contracts.mjs';

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
 const base=await baseLedger.status();
 if(!/^[a-f0-9-]{36}$/i.test(base.id||''))return null;
 const runId=gapRunId(base.id,brief,secret);
 const markerKey='audit:managed-gap-authorization:'+briefHash(brief);
 const authorization=await baseLedger.get(markerKey);
 const remaining=Math.max(0,Math.min(gapCapKurus,tariff.capKurus-base.chargedKurus));
 if(!authorization){
  if(action!=='complete_gaps')return sections.length&&remaining?{available:true,sections:sections.map(id=>managedSections[id]),capKurus:remaining}:null;
  if(!sections.length||!remaining)return null;
  await baseLedger.once(markerKey,{runId,sections},0,async()=>({runId,sections,sharedBudget:true,baseline:base.chargedKurus,allowance:remaining}));
 }
 const authorized=(authorization||await baseLedger.get(markerKey))?.value;
 if(!authorized||authorized.runId!==runId)throw new BudgetError('completion_unavailable','Ek araştırma yetkisi doğrulanamadı.');
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
    return {report:result.report,analysisPacket:result.analysisPacket};
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
 const providers=getProviders({ledger,fetchImpl,phase:'synthesis',researchVersion:'v8',phaseLimitKurus:ceiling,managedAudit:true,managedBudgetVersion:3});
 const original=synthesis.report;
 const brand=await previous('brand');
 const priorPlan=synthesis.supervision.researchPlan;
 const existing=original.findings.filter(f=>sections.includes(f.bhsSection)&&f.recommendation?.action&&f.recommendation?.measurement)
  .map(f=>[f.bhsSection,f.statement,f.swotQuadrant||null,f.peerId||null]);
 const planned=(await focusedResearchPlan({brief,sections,priorPlan,findings:existing,providers})).data;
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
 const knownUrls=new Set(priorCorpus.packet.sources.filter(source=>source.method!=='search-snippet'&&!source.metadataOnly)
  .map(source=>researchUrl(source.finalUrl)));
 const urls=unique(searches.flatMap(s=>s.results.map(r=>researchUrl(r.url))).filter(url=>url&&!knownUrls.has(url)));
 const fresh=await readResearchPages(brief,brand.plan,urls,pool,collect);
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
 const {report:patch}=await synthesizeManagedReport({brief,brand,plan:{...priorPlan,coveragePolicy:2},context,inventory,providers,sections,existing,evidenceUrls:newUrls,retainedProofs,sectional:true,allowPartial:true});
 const report=mergeManagedGapReport(original,patch,sections);
 const cited=new Set(report.sources.map(s=>s.url));
 const priorPacket=synthesis.analysisPacket;
 return {report,analysisPacket:{...context.packet,
  sources:[...new Map([...priorPacket.sources,...context.packet.sources].filter(s=>cited.has(s.finalUrl||s.url)).map(s=>[(s.finalUrl||s.url)+' '+s.contentHash,s])).values()],
  citationCards:[...new Map([...(priorPacket.citationCards||[]),...context.packet.citationCards].filter(s=>cited.has(s.url)).map(s=>[s.id,s])).values()]}};
}

export function mergeManagedGapReport(original,patch,sections){
 const acceptedPeers=new Set(original.competitors.map(peer=>peer.website));
 const peerCandidates=new Map(patch.competitors.filter(peer=>!acceptedPeers.has(peer.website)).map(peer=>[peer.id,peer]));
 const statementKey=f=>[f.bhsSection,f.swotQuadrant||'',f.peerId||'',f.statement.trim().toLocaleLowerCase('tr')].join('\0');
 const existingStatements=new Set(original.findings.map(statementKey));
 const findings=[...original.findings];
 const competitors=[...original.competitors];
 for(const f of patch.findings){
  const key=statementKey(f),peer=peerCandidates.get(f.peerId);
  if(!sections.includes(f.bhsSection)||existingStatements.has(key)||f.peerId&&(!peer||acceptedPeers.has(peer.website)||competitors.length>=10))continue;
  const count=findings.filter(prior=>prior.bhsSection===f.bhsSection).length;
  if(count>=10)continue;
  findings.push({...f,bhsRank:count+1});
  existingStatements.add(key);
  if(peer){competitors.push(peer);acceptedPeers.add(peer.website);}
 }
 const addedIds=new Set(findings.slice(original.findings.length).map(f=>f.id));
 const sourceIds=new Set([...findings,...competitors].flatMap(f=>f.sourceIds));
 return {...original,findings,competitors,
  sources:[...new Map([...original.sources,...patch.sources.filter(s=>sourceIds.has(s.id))].map(s=>[s.id,s])).values()],
  meetingQuestions:[...original.meetingQuestions,...patch.meetingQuestions.filter(q=>q.findingIds.some(id=>addedIds.has(id)))],
  dimensions:original.dimensions.map(d=>({...d,findingIds:[...d.findingIds,...findings.filter(f=>addedIds.has(f.id)&&f.dimension===d.id).map(f=>f.id)]}))};
}
