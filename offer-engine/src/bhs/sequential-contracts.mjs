import {hash,BudgetError} from '../budget/ledger.mjs';
import {expertContext,expertSchema,expertModelInput} from './expert-report.mjs';
import {methodologyAreas} from './methodology-areas.mjs';

export const sequentialVersion='sellf-pre-bhs-2026-11-10-sequential-v8';
export const sequentialPhases=Object.freeze(['brand_plan','brand_sources','brand_draft','brand_review','brand_correction_sources','brand_correction_draft','brand','sector_sources','sector_draft','sector_review','sector_correction_sources','sector_correction_draft','sector','competition_plan','competition_sources','competition_draft','competition_review','competition_correction_sources','competition_correction_draft','competition','swot_sources','swot_draft','swot_review','swot_correction_sources','swot_correction_draft','swot','coverage_plan','coverage_sources','coverage_actors','coverage_discovery','coverage','synthesis','scope','complete']);
export const logicalPhases=Object.freeze(['brand','sector','competition','swot','coverage','synthesis']);
export const sequentialTitles=Object.freeze({brand:'Marka kimliği ve iş modeli',sector:'Sektör, gelir dinamikleri ve müşteri',competition:'Doğrudan rekabet ve sektör riskleri',swot:'SWOT, itibar ve darboğazlar',coverage:'BHS kapsamı ve eksik araştırması',synthesis:'Son kontrol ve nihai ön BHS'});
// A stage may spend only its share of the SAME 50 TRY account. The remainder
// protects later research, final analysis and existing offer operations.
export const stageCeilings=Object.freeze({brand:1400,sector:2100,competition:2600,swot:2800,coverage:3000,synthesis:4400,scope:5000});
export const str=(maxLength=600)=>({type:'string',maxLength});
export const arr=(items,maxItems=24)=>({type:'array',items,maxItems});
export const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const refs=arr(str(80),12);
export const factSchema=obj({id:str(80),topic:str(80),statement:str(600),sourceIds:refs,limitation:str(400)});
export const extractionSchema=obj({facts:arr(factSchema),unknowns:arr(str(400),12)});
export const taskSchema=obj({instruction:str(1200),queries:arr(str(500),2)});
export const reviewSchema=obj({acceptedIds:arr(str(80)),rejectedIds:arr(str(80)),decision:{type:'string',enum:['accepted','limited']},missing:arr(str(400),12),notes:str(1400),nextTask:taskSchema,repairTask:taskSchema});
export const peerSchema=expertSchema.properties.peers.items;
export const peerReviewSchema=obj({...reviewSchema.properties,peers:arr(peerSchema,5)});
export const swotFindingSchema=structuredClone(expertSchema.properties.findings.items);
swotFindingSchema.properties.quadrant={type:'string',enum:['strength','weakness','opportunity','threat']};swotFindingSchema.required.push('quadrant');
export const swotSchema=obj({findings:arr(swotFindingSchema,24),unknowns:arr(str(400),12)});
export const coverageSchema=obj({coverage:expertSchema.properties.coverage,queries:arr(str(500),2),actorRequests:arr(obj({actor:str(120),url:str(2048),purpose:str(400),countryCode:str(2),language:str(2)}),2),priorities:arr(str(500),6)});
export const finalSchema=obj({...expertSchema.properties,swot:obj(Object.fromEntries(['strength','weakness','opportunity','threat'].map(k=>[k,arr(str(80),12)])))});
export const factTopics=Object.freeze({brand:['identity','products','business_model','market','scale','ownership'],sector:['sector','revenue_drivers','customer_behavior','sales_conditions','market_risk'],competition:['product_overlap','audience_overlap','geography','price','differentiation','competitive_risk']});
export function phaseExtractionSchema(phase){const s=structuredClone(extractionSchema);s.properties.facts.items.properties.topic.enum=factTopics[phase];return s;}

// A proof remains the same after collection order, snippets or enrichment change.
// Stable IDs are a v8 adapter; historical v6/v7 paragraph IDs remain untouched.
export function sequentialContext(brief,evidence){
 const c=expertContext(brief,evidence,{allParagraphs:true,includeTechnicalSignals:false}),mapping=new Map(c.cards.map(p=>[p.id,'p_'+hash({url:p.url,quote:p.quote}).slice(0,24)]));
 c.cards=[...new Map(c.cards.map(p=>[mapping.get(p.id),{...p,id:mapping.get(p.id)}])).values()];
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
export function stageModelInput(context,{rows,sample=false,areas=false}={}){
 const input=structuredClone(context.input);
 if(!areas)delete input.areas;
 input.citationContract='sourceIds alanlarında URL, ev1 veya paragraf metni kullanma. Yalnız her kaynak kesitinin proofIds listesindeki p_ ile başlayan kimlikleri aynen kopyala. sharedParagraphId varsa metni sharedParagraphs içinden oku; atıf kimliği yine proofIds değeridir.';
 if(rows){
  const ids=new Set(rows.flatMap(r=>r.sourceIds||[]).flatMap(id=>context.proofGroups.get(id)||[id]));
  input.sources=input.sources.map(s=>({...s,sections:s.sections.filter(p=>p.proofIds.some(id=>ids.has(id)))})).filter(s=>s.sections.length);
  input.selectionScope='Original candidate-cited paragraphs; no whole-site absence claim is justified. Full source snapshots remain saved for the final audit.';
 }
 if(sample){
  let used=0;input.sources=input.sources.slice(0,2).map(s=>({...s,sections:s.sections.filter(p=>{if(used+p.text.length>6000)return false;used+=p.text.length;return true;}).slice(0,6)}));
  input.selectionScope='Planning sample only. Operators read the complete captured packet before conclusions.';
 }
 return expertModelInput({...context,input});
}
export function withProofIds(schema,context){
 const out=structuredClone(schema),ids=[...context.known.keys()];
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
export function qualityAcceptance(report,{stages,swot,budget}){
 const issues=[],sourceIds=new Set((report.sources||[]).filter(s=>s.verification?.status==='quote_matched').map(s=>s.id));
 const backed=f=>f.sourceIds?.length&&f.sourceIds.every(id=>sourceIds.has(id));
 const findings=(report.findings||[]).filter(f=>f.kind!=='brief'&&backed(f));
 if(findings.length<12)issues.push('insufficient_substantive_findings');
 if(new Set(findings.map(f=>String(f.statement||'').toLocaleLowerCase('tr').replace(/\s+/g,' ').trim())).size<Math.min(12,findings.length))issues.push('duplicate_findings');
 if(new Set(findings.map(f=>f.dimension)).size<6)issues.push('insufficient_dimension_depth');
 if((report.competitors||[]).length<3)issues.push('direct_competitors_incomplete');
 if((report.researchCoverage||[]).length!==methodologyAreas.length)issues.push('methodology_fields_incomplete');
 if((report.findings||[]).some(f=>!backed(f)))issues.push('unsupported_finding');
 for(const quadrant of ['strength','weakness','opportunity','threat'])if(!swot.some(f=>f.quadrant===quadrant&&backed(f)))issues.push('swot_'+quadrant+'_incomplete');
 if(stages.length!==5||stages.some(s=>s.decision!=='accepted')||stages.map(s=>s.phase).join('|')!==logicalPhases.slice(0,5).join('|'))issues.push('stage_understanding_incomplete');
 if(!Number.isSafeInteger(budget?.chargedKurus)||budget.chargedKurus<500||budget.chargedKurus>5000||budget.capKurus!==5000)issues.push('cost_not_verified');
 return {passed:issues.length===0,issues,findingCount:findings.length,directCompetitors:(report.competitors||[]).length,dimensions:new Set(findings.map(f=>f.dimension)).size,coverage:(report.researchCoverage||[]).length};
}
