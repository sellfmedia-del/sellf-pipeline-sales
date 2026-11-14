import {hash,BudgetError} from '../budget/ledger.mjs';
import {expertContext,expertSchema,expertModelInput} from './expert-report.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {dimensions} from './brief.mjs';

export const sequentialVersion='sellf-pre-bhs-2026-11-10-sequential-v8';
export const sequentialPhases=Object.freeze(['brand_plan','brand_sources','brand_draft','brand_review','brand_correction_sources','brand_correction_draft','brand','sector_sources','sector_draft','sector_review','sector_correction_sources','sector_correction_draft','sector','sector_validation','competition_plan','competition_sources','competition_draft','competition_review','competition_correction_sources','competition_correction_draft','competition','swot_sources','swot_draft','swot_review','swot_correction_sources','swot_correction_draft','swot','coverage_plan','coverage_sources','coverage_actors','coverage_discovery','coverage','report_draft','synthesis','scope','complete']);
export const logicalPhases=Object.freeze(['brand','sector','competition','swot','coverage','synthesis']);
export const sequentialTitles=Object.freeze({brand:'Marka kimliği ve iş modeli',sector:'Sektör, gelir dinamikleri ve müşteri',competition:'Doğrudan rekabet ve sektör riskleri',swot:'SWOT, itibar ve darboğazlar',coverage:'BHS kapsamı ve eksik araştırması',synthesis:'Son kontrol ve nihai ön BHS'});
// Every phase shares the same run-level 50 TRY account; no phase allocation.
export const str=(maxLength=600)=>({type:'string',maxLength});
export const arr=(items,maxItems)=>({type:'array',items,...(maxItems===undefined?{}:{maxItems})});
const findingArrayKeys=new Set(['facts','findings','sourceIds','findingIds','comparisonFindingIds','acceptedIds','rejectedIds','patches','additionalFacts','missing','unknowns','strength','weakness','opportunity','threat']);
export function withoutFindingCeilings(schema){
 const copy=structuredClone(schema);
 const walk=(node,key)=>{if(node.type==='array'&&findingArrayKeys.has(key))delete node.maxItems;if(node.properties)for(const [name,value]of Object.entries(node.properties))walk(value,name);if(node.items)walk(node.items,key);if(node.anyOf)for(const value of node.anyOf)walk(value,key);};
 walk(copy);return copy;
}
const expertProperties=withoutFindingCeilings(expertSchema).properties;
export const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const refs=arr(str(80));
export const factSchema=obj({id:str(80),kind:{type:'string',enum:['observation','inference']},topic:str(80),statement:str(600),sourceIds:refs,limitation:str(400)});
export const extractionSchema=obj({facts:arr(factSchema),unknowns:arr(str(400))});
// Internal operator tasks carry source/identity safeguards as well as the brief.
// Keep a finite transport bound without rejecting an otherwise valid 1,622-char
// task or cutting away the manager's evidence instructions. Generation still
// has its existing token/account cap; public findings keep their tighter bounds.
export const actorRequestsSchema=arr(obj({actor:str(120),url:str(2048),purpose:str(400),countryCode:str(2),language:str(2)}),2);
export const taskSchema=obj({instruction:str(6000),queries:arr(str(500),2),actorRequests:actorRequestsSchema});
const conciseFact=structuredClone(factSchema);conciseFact.properties.topic.enum=['sector','revenue_drivers','customer_behavior','sales_conditions','market_risk'];conciseFact.properties.statement.maxLength=320;conciseFact.properties.limitation.maxLength=180;
export const understandingSchema=obj({facts:arr(conciseFact),unknowns:arr(str(200)),decision:{type:'string',enum:['accepted','limited']},notes:str(6000),nextTask:taskSchema});
export const reviewSchema=obj({acceptedIds:arr(str(80)),rejectedIds:arr(str(80)),decision:{type:'string',enum:['accepted','limited']},missing:arr(str(400)),notes:str(6000),nextTask:taskSchema,repairTask:taskSchema});
export const factReviewSchema=obj({...reviewSchema.properties,patches:arr(factSchema),additionalFacts:arr(factSchema)});
export const understandingTopics=Object.freeze({brand:['identity','products','business_model','market'],sector:['sector','revenue_drivers','customer_behavior']});
export function reviewVerdictSchema(schema,rows,{phase,portable=false}={}){
 const result=withoutFindingCeilings(schema),ids=rows.map(r=>r.id);
 if(result.properties.additionalFacts&&factTopics[phase])result.properties.additionalFacts.items.properties.topic.enum=factTopics[phase];
 if(new Set(ids).size!==ids.length)throw new BudgetError('model_output_invalid','Denetim aday kimlikleri yineleniyor.');
 delete result.properties.acceptedIds;delete result.properties.rejectedIds;
 const decision={type:'string',enum:['accepted','rejected']};
 result.properties.verdicts=portable?arr(obj({id:str(80),decision})):obj(Object.fromEntries(ids.map(id=>[id,decision])));
 result.required=result.required.filter(k=>!['acceptedIds','rejectedIds'].includes(k));result.required.push('verdicts');
 if(phase==='brand'){result.properties.marketContext=obj({basis:{type:'string',enum:['source','brief_declared','unknown']},description:str(600),sourceIds:refs,briefQuote:str(600)});result.required.push('marketContext');}
 if(understandingTopics[phase]){delete result.properties.decision;result.required=result.required.filter(k=>k!=='decision');result.properties.fundamentals=obj(Object.fromEntries(understandingTopics[phase].map(topic=>[topic,{type:'string',enum:['confirmed','incomplete']}] )));result.required.push('fundamentals');}
 return result;
}
export function normalizeVerdictReview(data,rows,{phase}={}){
 const {verdicts:rawVerdicts,...review}=data,ids=rows.map(r=>r.id);
 const verdicts=Array.isArray(rawVerdicts)?Object.fromEntries(rawVerdicts.map(v=>[v.id,v.decision])):rawVerdicts;
 if(Array.isArray(rawVerdicts)&&rawVerdicts.length!==ids.length)throw new BudgetError('model_output_invalid','Her aday için ayrı ve eksiksiz denetim kararı gerekli.');
 if(!verdicts||Object.keys(verdicts).length!==ids.length||ids.some(id=>!['accepted','rejected'].includes(verdicts[id])))throw new BudgetError('model_output_invalid','Her aday için ayrı ve eksiksiz denetim kararı gerekli.');
 const topics=understandingTopics[phase];
 if(topics&&(!data.fundamentals||Object.keys(data.fundamentals).sort().join('|')!==[...topics].sort().join('|')||topics.some(t=>!['confirmed','incomplete'].includes(data.fundamentals[t]))))throw new BudgetError('model_output_invalid','Temel anlayış kararları eksik.');
 return {...review,...(topics?{decision:topics.every(t=>data.fundamentals[t]==='confirmed')?'accepted':'limited'}:{}),acceptedIds:ids.filter(id=>verdicts[id]==='accepted'),rejectedIds:ids.filter(id=>verdicts[id]==='rejected')};
}
export const peerSchema=expertProperties.peers.items;
export const peerReviewSchema=obj({...factReviewSchema.properties,peers:arr(peerSchema,5)});
export const swotFindingSchema=structuredClone(expertProperties.findings.items);
swotFindingSchema.properties.quadrant={type:'string',enum:['strength','weakness','opportunity','threat']};swotFindingSchema.required.push('quadrant');
export const swotSchema=obj({findings:arr(swotFindingSchema),unknowns:arr(str(400))});
export const swotReviewSchema=obj({...reviewSchema.properties,patches:arr(swotFindingSchema),additionalFacts:arr(swotFindingSchema)});
export const coverageSchema=obj({coverage:expertProperties.coverage,queries:arr(str(500),2),actorRequests:actorRequestsSchema,priorities:arr(str(500))});
const researchTarget={type:'string',enum:[...dimensions.map(d=>d.id),'brand','sector','strength','weakness','opportunity','threat']};
export const targetedCoverageSchema=obj({...coverageSchema.properties,queries:arr(obj({query:str(500),target:researchTarget}),2),actorRequests:arr(obj({...actorRequestsSchema.items.properties,target:researchTarget}),2)});
export const finalSchema=obj({...expertProperties,swot:obj(Object.fromEntries(['strength','weakness','opportunity','threat'].map(k=>[k,arr(str(80))])))});

const patch=structuredClone(expertProperties.findings.items);
for(const [field,limit]of Object.entries({observation:280,commercialHypothesis:260,limitation:220,question:180}))patch.properties[field].maxLength=limit;
export const finalReviewSchema=obj({acceptedIds:arr(str(80)),rejectedIds:arr(str(80)),patches:arr(patch),rejectedPeerIds:arr(str(80),5),dimensions:expertProperties.dimensions,coverageChanges:arr(obj({key:{type:'string',enum:methodologyAreas.map(a=>a.key)},value:structuredClone(Object.values(expertProperties.coverage.properties)[0])})),approvedBenchmarkIndices:arr({type:'number',minimum:0,maximum:47},48),swot:finalSchema.properties.swot,decision:{type:'string',enum:['accepted','limited']},notes:str(6000)});
export function applyFinalReview(draft,review,context,peers=draft.peers){
 const selected=acceptedRows(draft.findings,review),ids=new Set(selected.map(f=>f.id)),patches=new Map();
 for(const p of review.patches){if(!ids.has(p.id)||patches.has(p.id))throw new BudgetError('model_output_invalid','Son denetim düzeltmesi kabul edilen bulguya bağlı değil.');patches.set(p.id,p);}
 const findings=selected.map(f=>patches.get(f.id)||f);validateProofRows(findings,context);
 const peerIds=new Set(peers.map(p=>p.entityId));if(review.rejectedPeerIds.some(id=>!peerIds.has(id)))throw new BudgetError('model_output_invalid','Son denetimde bilinmeyen rakip kimliği.');
 const coverage=structuredClone(draft.coverage),changed=new Set();
 for(const c of review.coverageChanges){if(changed.has(c.key))throw new BudgetError('model_output_invalid','Yinelenen alan düzeltmesi.');changed.add(c.key);coverage[c.key]=c.value;}
 for(const c of Object.values(coverage)){c.findingIds=c.findingIds.filter(id=>ids.has(id));if(!c.findingIds.length)c.status='unavailable';}
 for(const d of review.dimensions)if([...d.findingIds,...d.comparisonFindingIds].some(id=>!ids.has(id)))throw new BudgetError('model_output_invalid','Son boyut değerlendirmesi reddedilmiş bulguya bağlı.');
 if(review.dimensions.length!==6||new Set(review.dimensions.map(d=>d.id)).size!==6)throw new BudgetError('model_output_invalid','Son denetim altı farklı boyutu değerlendirmeli.');
 if(review.approvedBenchmarkIndices.some(i=>!Number.isSafeInteger(i)||i>=draft.benchmarks.length)||Object.values(review.swot).flat().some(id=>!ids.has(id)))throw new BudgetError('model_output_invalid','Son SWOT veya kıyas kimliği geçersiz.');
 return {...draft,findings,peers:peers.filter(p=>!review.rejectedPeerIds.includes(p.entityId)),dimensions:review.dimensions,coverage,benchmarks:[...new Set(review.approvedBenchmarkIndices)].map(i=>draft.benchmarks[i]),swot:review.swot,overviewIds:draft.overviewIds.filter(id=>ids.has(id)),opportunityId:ids.has(draft.opportunityId)?draft.opportunityId:null,riskId:ids.has(draft.riskId)?draft.riskId:null};
}
export const factTopics=Object.freeze({brand:['identity','products','business_model','market','scale','ownership'],sector:['sector','revenue_drivers','customer_behavior','sales_conditions','market_risk'],competition:['product_overlap','audience_overlap','geography','price','differentiation','competitive_risk']});
// Finding quantity has no artificial ceiling. Topic/proof validation, minimum
// understanding requirements and the one run-level cost cap still apply.
export function phaseExtractionSchema(phase){const s=structuredClone(extractionSchema);s.properties.facts.items.properties.topic.enum=factTopics[phase];return s;}

// A proof remains the same after collection order, snippets or enrichment change.
// Stable IDs are a v8 adapter; historical v6/v7 paragraph IDs remain untouched.
export function sequentialContext(brief,evidence,{completeSources=evidence.peerDiscoveryVersion==='product-v2',includeTechnicalSignals=false,completeEvidence=false}={}){
 const c=expertContext(brief,evidence,{allParagraphs:true,includeTechnicalSignals,completeEvidence,paragraphBudget:completeSources?420000:60000}),mapping=new Map(c.cards.map(p=>[p.id,'p_'+hash({url:p.url,quote:p.quote}).slice(0,24)]));
 c.completeSources=completeSources;
 const byProof=new Map();
 for(const card of c.cards){
  const id=mapping.get(card.id),prior=byProof.get(id);
  if(card.method==='search-snippet'&&prior&&prior.method!=='search-snippet')continue;
  byProof.set(id,{...card,id});
 }
 c.cards=[...byProof.values()];
 const actorSources=new Map((evidence.packet.sources||[]).filter(s=>s.provenance?.actor).map(s=>[s.finalUrl||s.url,s]));
 for(const card of c.cards)if(actorSources.has(card.url))card.scope=actorSources.get(card.url).scope;
 for(const source of c.input.sources)if(actorSources.has(source.url))source.scope=actorSources.get(source.url).scope;
 c.known=new Map(c.cards.map(p=>[p.id,p]));
 c.proofGroups=new Map([...c.proofGroups].map(([id,group])=>[mapping.get(id),[...new Set(group.map(p=>mapping.get(p)))]]));
 for(const source of c.input.sources)for(const section of source.sections)section.proofIds=[...new Set(section.proofIds.map(id=>mapping.get(id)))];
 return c;
}
export function validateProofRows(rows,context){
 const seen=new Set();
 for(const row of rows){
  if(!row.id||seen.has(row.id)||!row.sourceIds?.length||row.sourceIds.some(id=>!context.known.has(id)))throw new BudgetError('model_output_invalid','Aşama bulgusunda kaynak kimliği eksik veya geçersiz.');
  seen.add(row.id);
 }
}
// A bad operator candidate is rejected before review; it cannot erase other
// candidates or prevent the independent expert from reading original sources.
// This is candidate admission only. The logical-stage/final gates stay strict.
export function selectReviewableFacts(rows,context){
 const counts=new Map();for(const row of rows)counts.set(row.id,(counts.get(row.id)||0)+1);
 const facts=[],rejected=[];
 for(const row of rows){
  let reason;
  if(!(row.statement??row.observation??'').trim())reason='empty_statement';
  else if(counts.get(row.id)!==1)reason='duplicate_id';
  else try{validateProofRows([row],context);}catch{reason='missing_or_unknown_proof';}
  if(reason)rejected.push({id:row.id,reason});else facts.push(row);
 }
 return {facts,rejected};
}
export function stageModelInput(context,{rows,sample=false,areas=false}={}){
 const input=structuredClone(context.input);
 if(!areas)delete input.areas;
 input.citationContract='sourceIds alanlarında URL, ev1 veya paragraf metni kullanma. Yalnız her kaynak kesitinin proofIds listesindeki p_ ile başlayan kimlikleri aynen kopyala. sharedParagraphId varsa metni sharedParagraphs içinden oku; atıf kimliği yine proofIds değeridir.';
 if(rows){
  const ids=new Set(rows.flatMap(r=>r.sourceIds||[]).flatMap(id=>context.proofGroups.get(id)||[id]));
  input.sources=input.sources.map(s=>({...s,sections:s.sections.filter(p=>p.proofIds.some(id=>ids.has(id)))})).filter(s=>s.sections.length);
  input.selectionScope='Original candidate-cited paragraphs; no whole-site absence claim is justified. Full source snapshots remain saved for the final audit.';
 }
 if(context.completeSources&&!rows&&!sample){
  // Keep proof IDs for the full packet. Bound only the general operator view
  // and alternate sources so old pages cannot fill it before a new publisher.
  let used=0;
  const chosen=input.sources.map(()=>[]),depth=Math.max(0,...input.sources.map(s=>s.sections.length));
  for(let i=0;i<depth;i++)for(let j=0;j<input.sources.length;j++){
   const p=input.sources[j].sections[i];
   if(p&&used+p.text.length<=76000){chosen[j].push(p);used+=p.text.length;}
  }
  input.sources=input.sources.map((s,i)=>({...s,sections:chosen[i]})).filter(s=>s.sections.length);
  input.selectionScope='Balanced original source excerpts. Evidence beyond these excerpts is retained in the stage receipt.';
 }
 if(sample){
  let used=0;input.sources=input.sources.slice(0,2).map(s=>({...s,sections:s.sections.filter(p=>{if(used+p.text.length>6000)return false;used+=p.text.length;return true;}).slice(0,6)}));
  input.selectionScope='Planning sample only. Operators read the complete captured packet before conclusions.';
 }
 return expertModelInput({...context,input});
}
export function withProofIds(schema,context){
 const out=withoutFindingCeilings(schema),ids=[...context.known.keys()];
 // Gemini rejects large enum grammars. Larger packets use the explicit
 // citation contract and the identical server-side membership validation.
 const bind=s=>{if(s.properties)for(const [key,value]of Object.entries(s.properties)){if(key==='sourceIds'&&ids.length<=128)value.items={...value.items,enum:ids};else bind(value);}if(s.items)bind(s.items);};
 bind(out);return out;
}
export function acceptedRows(rows,review){
 const ids=new Set(rows.map(f=>f.id)),accepted=new Set(review.acceptedIds);
 if(accepted.size!==review.acceptedIds.length||review.acceptedIds.some(id=>!ids.has(id))||review.rejectedIds.some(id=>!ids.has(id)||accepted.has(id)))throw new BudgetError('model_output_invalid','Yönetici denetimi bilinmeyen veya çelişkili bulgu kimliği içeriyor.');
 if([...ids].some(id=>!accepted.has(id)&&!review.rejectedIds.includes(id)))throw new BudgetError('model_output_invalid','Yönetici bütün aday bulguları değerlendirmeli.');
 return rows.filter(f=>accepted.has(f.id));
}
export function qualityAcceptance(report,{stages,swot,budget,finalDecision='accepted',reviewMode}){
 const issues=[],sourceIds=new Set((report.sources||[]).filter(s=>s.verification?.status==='quote_matched').map(s=>s.id));
 const backed=f=>f.sourceIds?.length&&f.sourceIds.every(id=>sourceIds.has(id));
 const findings=(report.findings||[]).filter(f=>f.kind!=='brief'&&backed(f));
 if(finalDecision!=='accepted')issues.push('manager_final_limited');
 if(findings.length<12)issues.push('insufficient_substantive_findings');
 if(new Set(findings.map(f=>String(f.statement||'').toLocaleLowerCase('tr').replace(/\s+/g,' ').trim())).size<Math.min(12,findings.length))issues.push('duplicate_findings');
 if(new Set(findings.map(f=>f.dimension)).size<6)issues.push('insufficient_dimension_depth');
 if((report.competitors||[]).length<3)issues.push('direct_competitors_incomplete');
 if((report.researchCoverage||[]).length!==methodologyAreas.length)issues.push('methodology_fields_incomplete');
 if((report.findings||[]).some(f=>!backed(f)))issues.push('unsupported_finding');
 for(const quadrant of ['strength','weakness','opportunity','threat'])if(!swot.some(f=>f.quadrant===quadrant&&backed(f)))issues.push('swot_'+quadrant+'_incomplete');
 const expectedStages=reviewMode==='collection-first'?['brand','collection']:logicalPhases.slice(0,5);
 if(stages.length!==expectedStages.length||stages.some((s,i)=>s.decision!=='accepted'||s.phase!==expectedStages[i]))issues.push('stage_understanding_incomplete');
 if(!Number.isSafeInteger(budget?.chargedKurus)||budget.chargedKurus<500||budget.chargedKurus>5000||budget.capKurus!==5000)issues.push('cost_not_verified');
 return {passed:issues.length===0,issues,findingCount:findings.length,directCompetitors:(report.competitors||[]).length,dimensions:new Set(findings.map(f=>f.dimension)).size,coverage:(report.researchCoverage||[]).length};
}

