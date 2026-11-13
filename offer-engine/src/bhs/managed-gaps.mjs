import {createHmac} from 'node:crypto';
import {BudgetError} from '../budget/ledger.mjs';
import {briefHash} from './brief.mjs';
import {capBhsLedger,gapCapKurus} from './managed-budget.mjs';
import {managedIndexInstruction,managedSections,synthesizeManagedReport} from './managed-report.mjs';
import {focusedResearchPlan} from './managed-research.mjs';
import {collectionCorpus,comparisonResearch,peerCandidates,readResearchPages,retainedManagedProofs} from './collection-first.mjs';
import {createEvidenceCollector} from './evidence.mjs';
import {researchUrl} from './research-url.mjs';
import {arr,obj,sequentialContext,stageModelInput,str} from './sequential-contracts.mjs';

const receiptKey='audit:managed-gap-result';

const indexSchema=obj({observations:arr(obj({area:str(80),text:str(350),sourceIds:arr(str(80))})),organizations:arr(obj({name:str(120),sourceId:str(80)}))});
const unique=values=>[...new Set(values)];
const recoverable=error=>error instanceof BudgetError||['TimeoutError','AbortError'].includes(error.name)||error instanceof TypeError&&error.message==='fetch failed';

function gapRunId(baseId,brief,secret){
 const id=createHmac('sha256',secret).update('bhs-content-gap:'+baseId+':'+briefHash(brief)).digest('hex').slice(0,32);
 return id.slice(0,8)+'-'+id.slice(8,12)+'-4'+id.slice(13,16)+'-8'+id.slice(17,20)+'-'+id.slice(20);
}

export async function resolveManagedGaps({action,brief,synthesis,sections,secret,baseLedger,getGapLedger,getProviders,previous,allowance=true,collect=createEvidenceCollector({timeout:25000,allowPartialPlan:true})}){
 if(synthesis.supervision?.reviewMode!=='managed-audit'||!allowance)return null;
 const base=await baseLedger.status();
 if(!/^[a-f0-9-]{36}$/i.test(base.id||''))return null;
 const runId=gapRunId(base.id,brief,secret);
 const markerKey='audit:managed-gap-authorization:'+briefHash(brief);
 const authorization=await baseLedger.get(markerKey);
 if(!authorization&&action!=='complete_gaps')return sections.length?{available:true,sections:sections.map(id=>managedSections[id]),capKurus:gapCapKurus}:null;
 if(action==='complete_gaps'&&!authorization){
  if(!sections.length)throw new BudgetError('completion_unavailable','Tamamlanacak BHS bölümü bulunamadı.');
  await baseLedger.once(markerKey,{runId,sections},0,async()=>({runId,sections}));
 }
 const ledger=await getGapLedger(runId);
 // The authorized run gets its own ledger. The initial BHS keeps its original
 // physical 50 TRY account and every uncertain charge remains reserved.
 await ledger.begin();
 const scoped=capBhsLedger(ledger,gapCapKurus);
 let receipt=await ledger.get(receiptKey);
 if(!receipt&&action==='complete_gaps'){
  const authorized=(await baseLedger.get(markerKey))?.value;
  if(!authorized||authorized.runId!==runId)throw new BudgetError('completion_unavailable','Ek araştırma yetkisi doğrulanamadı.');
  try{
   await scoped.once(receiptKey,{runId},0,async()=>{
    const result=await completeSections({brief,synthesis,sections:authorized.sections,ledger:scoped,getProviders,previous,collect});
    return {report:result.report,analysisPacket:result.analysisPacket};
   });
  }catch(error){
   // An interrupted response can be read later. No new paid retry is opened.
   if(error.code!=='budget_pending'&&!(await ledger.get(receiptKey)))throw error;
  }
  receipt=await ledger.get(receiptKey);
 }
 const {chargedKurus}=await ledger.status();
 return {available:false,chargedKurus,capKurus:gapCapKurus,status:receipt?.state||'authorized',
   ...(receipt?.state==='complete'?{synthesis:{...synthesis,...receipt.value}}:{})};
}

async function completeSections({brief,synthesis,sections,ledger,getProviders,previous,collect}){
 const deadline=AbortSignal.timeout(260000);
 const fetchImpl=(url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([deadline,init.signal]):deadline});
 const providers=getProviders({ledger,fetchImpl,phase:'synthesis',researchVersion:'v8',phaseLimitKurus:gapCapKurus,managedAudit:true});
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
 const pool=providers.withCeiling(1700);
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
 const context=sequentialContext(brief,{packet:evidence,searches:[],peerDiscoveryVersion:'product-v2'},{includeTechnicalSignals:true});
 context.collectionFirst=true;
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
 const acceptedPeers=new Set(original.competitors.map(peer=>peer.website));
 const existingStatements=new Set(original.findings.map(f=>f.statement.trim().toLowerCase()));
 const additions=patch.findings.filter(f=>sections.includes(f.bhsSection)&&!existingStatements.has(f.statement.trim().toLowerCase())
  &&(!f.peerId||patch.competitors.some(p=>p.id===f.peerId&&!acceptedPeers.has(p.website))));
 const peersAdded=new Set(additions.map(f=>f.peerId).filter(Boolean));
 const findings=[...original.findings];
 for(const f of additions){
  const count=findings.filter(prior=>prior.bhsSection===f.bhsSection).length;
  if(count<10)findings.push({...f,bhsRank:count+1});
 }
 const addedIds=new Set(findings.slice(original.findings.length).map(f=>f.id));
 const sourceIds=new Set(findings.flatMap(f=>f.sourceIds));
 const report={...original,findings,
  sources:[...new Map([...original.sources,...patch.sources.filter(s=>sourceIds.has(s.id))].map(s=>[s.id,s])).values()],
  competitors:[...original.competitors,...patch.competitors.filter(p=>peersAdded.has(p.id)&&findings.some(f=>f.peerId===p.id))].slice(0,10),
  meetingQuestions:[...original.meetingQuestions,...patch.meetingQuestions.filter(q=>q.findingIds.some(id=>addedIds.has(id)))],
  dimensions:original.dimensions.map(d=>({...d,findingIds:[...d.findingIds,...findings.filter(f=>addedIds.has(f.id)&&f.dimension===d.id).map(f=>f.id)]}))};
 const cited=new Set(report.sources.map(s=>s.url));
 const priorPacket=synthesis.analysisPacket;
 return {report,analysisPacket:{...context.packet,
  sources:[...new Map([...priorPacket.sources,...context.packet.sources].filter(s=>cited.has(s.finalUrl||s.url)).map(s=>[(s.finalUrl||s.url)+' '+s.contentHash,s])).values()],
  citationCards:[...new Map([...(priorPacket.citationCards||[]),...context.packet.citationCards].filter(s=>cited.has(s.url)).map(s=>[s.id,s])).values()]}};
}
