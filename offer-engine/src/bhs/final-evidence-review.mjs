import {BudgetError,hash} from '../budget/ledger.mjs';
import {dimensions} from './brief.mjs';
import {methodologyAreas} from './methodology-areas.mjs';
import {obj} from './sequential-contracts.mjs';
import {researchHost} from './research-url.mjs';

const quadrants=['strength','weakness','opportunity','threat'];
const areasByKey=new Map(methodologyAreas.map(area=>[area.key,area]));
const topics={identity:'operations',products:'funnel',business_model:'funnel',market:'operations',scale:'operations',ownership:'operations',sector:'financial',revenue_drivers:'financial',customer_behavior:'funnel',sales_conditions:'funnel',market_risk:'competition',product_overlap:'competition',audience_overlap:'competition',geography:'competition',price:'competition',differentiation:'competition',competitive_risk:'competition'};
const areaByTopic={revenue_drivers:'financial_4',business_model:'funnel_4',sales_conditions:'funnel_4',ownership:'operations_1',price:'competition_2',product_overlap:'competition_2',differentiation:'competition_2'};
const questions={financial:'Bu sinyali hangi dönemsel satış, maliyet ve kârlılık verileriyle değerlendirebiliriz?',operations:'Bunun operasyon üzerindeki etkisini hangi süreç veya hizmet verileriyle ölçüyorsunuz?',funnel:'Bu satış veya müşteri sinyali hangi kanal ve dönüşüm verileriyle doğrulanabilir?',digital:'Bu sayfa veya kanal için son ölçüm ve gerçek kullanıcı testleri ne gösteriyor?',perception:'Bu sinyal diğer kanallardaki müşteri geri bildirimi ve yanıt verileriyle örtüşüyor mu?',competition:'Bu rekabet sinyali eşdeğer ürün, kanal ve dönem kıyasına nasıl yansıyor?'};
const ordinal={type:'number',enum:[0,1,2,3,4,5]};
const fields=(rows,prefix,schema)=>obj(Object.fromEntries(rows.map((_,i)=>[prefix+(i+1),schema])));
export const finalEvidenceSchema=input=>obj({verdicts:fields(input.findings,'f',ordinal),benchmarks:fields(input.comparisons,'b',{type:'boolean'})});
export const orderedEvidenceVerdicts=(data,input)=>({verdicts:input.findings.map((_,i)=>data.verdicts['f'+(i+1)]),benchmarks:input.comparisons.map((_,i)=>data.benchmarks['b'+(i+1)])});

function qualifyComplaint(f,context){
 if(f.kind!=='observation'||!f.sourceIds?.length||!['operations','perception'].includes(f.dimension))return f;
 const hosts=new Set(f.sourceIds.map(id=>researchHost(context.known.get(id)?.url)));
 const platform=hosts.size===1?{'sikayetvar.com':'Şikayetvar','trustpilot.com':'Trustpilot'}[[...hosts][0]]:null;
 if(!platform)return f;
 const scopedObservation=f.observation.replace(/\bsıkça\s+/giu,'');
 const observation=scopedObservation.includes(platform)?scopedObservation:`${platform} örneklemi — ${scopedObservation}`;
 return {...f,dimension:'perception',observation,commercialHypothesis:'Tekrarlanan temalar, diğer kanallardaki geri bildirim ve iade kayıtlarıyla birlikte değerlendirilebilir.',limitation:`İncelenen ${platform} kesitiyle sınırlıdır. Toplam müşteri tabanını, şikâyet oranını ve satış etkisini göstermez.`,question:questions.perception};
}

// Keep the original, reviewed wording and its provenance when the draft
// repeats it. Draft-only claims still require a fresh verdict.
export function finalEvidenceCandidates(draft,stages,swot,context,corrections=[]){
 const areas=new Map(),hints=new Map(),reviewed=new Set(),approvedQuadrants=new Map(),rows=[];
 const approvedSwot=stages.some(stage=>stage.phase==='swot'&&stage.decision==='accepted');
 const textKey=value=>value.trim().toLocaleLowerCase('tr').replace(/\s+/g,' ');
 const add=(finding,area,quadrant,alreadyReviewed=false)=>{
  if(!finding.sourceIds?.length||finding.sourceIds.some(id=>!context.known.has(id)))return;
  if(rows.some(f=>f.id===finding.id||textKey(f.observation)===textKey(finding.observation)))return;
  rows.push(finding);
  if(area)areas.set(finding.id,area);
  if(quadrant)hints.set(finding.id,quadrant);
  if(alreadyReviewed)reviewed.add(finding.id);
 };
 for(const {quadrant,...f} of swot){
  const size=rows.length;
  add(f,null,quadrant,true);
  if(approvedSwot&&rows.length>size)approvedQuadrants.set(f.id,quadrant);
 }
 for(const stage of stages)for(const f of stage.facts||[]){
  const dimension=topics[f.topic];if(!dimension||!f.statement?.trim())continue;
  const substitute=stage.phase==='competition'&&f.topic==='product_overlap';
  const capability=stage.phase==='brand'&&f.kind==='observation'&&['identity','scale','products'].includes(f.topic)&&/sertifik|tesis|üretim kapasitesi|patent|certifi|facility|manufacturing capacity/iu.test(f.statement);
  const match=draft.findings.find(row=>row.dimension===dimension&&textKey(row.observation)===textKey(f.statement));
  add({id:match?.id||'reviewed_'+hash({phase:stage.phase,id:f.id}).slice(0,20),dimension,kind:f.kind,stance:'neutral',observation:f.statement,sourceIds:f.sourceIds,commercialHypothesis:substitute?'Aynı kategorideki alternatif ürünler satın alma kararında rekabet yaratabilir; talep etkisi ölçülmedi.':'Ticari etkisi şirketin kendi verileriyle değerlendirilebilir.',limitation:f.limitation||'Kapsam incelenen kaynak ve dönemle sınırlıdır.',question:questions[dimension],priority:'medium'},areaByTopic[f.topic],substitute?'threat':capability?'strength':null,true);
 }
 for(const f of draft.findings){
  const candidate=qualifyComplaint(f,context);
  const complaint=candidate!==f;
  add(candidate,complaint?'perception_2':null,complaint&&f.stance==='risk'?'weakness':quadrants.find(q=>draft.swot[q]?.includes(f.id)));
 }
 for(const f of corrections){
  const area=areasByKey.get(f.topic);
  if(!area||!f.statement?.trim()||!f.sourceIds?.length)continue;
  const candidate=qualifyComplaint({id:'coverage_'+hash({id:f.id,topic:f.topic}).slice(0,20),dimension:area.dimension,kind:f.kind,stance:'neutral',observation:f.statement,sourceIds:f.sourceIds,commercialHypothesis:'Bu gözlemin ticari etkisi markanın güncel verileriyle değerlendirilebilir.',limitation:f.limitation,question:questions[area.dimension],priority:'medium'},context);
  add(candidate,candidate.dimension==='perception'&&area.dimension!=='perception'?'perception_2':area.key);
 }
 for(const source of context.packet.sources.filter(s=>s.provenance?.actor==='logiover/website-seo-audit-crawler')){
  const cards=context.cards.filter(c=>c.url===source.finalUrl&&c.scope?.startsWith('Apify structured sample')&&/statusCode: 200\b|h1Count: 1\b/.test(c.quote));
  const status=cards.find(c=>/statusCode: 200\b/.test(c.quote));if(!status)continue;
  const heading=cards.find(c=>/h1Count: 1\b/.test(c.quote));
  add({id:'seo_'+hash(source.finalUrl).slice(0,20),dimension:'digital',kind:'observation',stance:'neutral',observation:new URL(source.finalUrl).hostname+' adresinden başlatılan Apify taramasında dönen HTML HTTP 200 olarak kaydedildi'+(heading?' ve bir H1 başlığı içeriyordu.':'.'),sourceIds:[...new Set([status.id,heading?.id].filter(Boolean))],commercialHypothesis:'Bu sinyaller sayfa düzeyinde teknik SEO kontrolüne başlangıç sağlar.',limitation:'Taramaya dönen statik HTML örneğidir. Türkiye oturumu, hız, mobil deneyim ve tüm sitenin durumu doğrulanmadı.',question:questions.digital,priority:'medium'},'digital_1');
 }
 return {rows,areas,hints,reviewed,approvedQuadrants};
}

export function finalEvidenceInput(candidates,benchmarks,context){
 const sources=[],numbers=new Map();
 const cite=ids=>[...new Set(ids.flatMap(id=>context.proofGroups.get(id)||[id]))].flatMap(id=>{
  const c=context.known.get(id);if(!c)return [];
  if(!numbers.has(id)){numbers.set(id,sources.length);sources.push([new URL(c.url).hostname,c.quote]);}
  return [numbers.get(id)];
 });
 const findings=candidates.rows.map(f=>{
  const reviewed=candidates.reviewed.has(f.id),hint=candidates.hints.get(f.id)||null;
  return [f.dimension,f.kind,f.observation,reviewed?'':f.limitation,reviewed?null:cite(f.sourceIds),hint,...(!reviewed||hint?[f.commercialHypothesis]:[])];
 });
 const comparisons=benchmarks.map(b=>[b.metric,b.entityId,b.value,b.unit,b.period,cite(b.sourceIds)]);
 return {findings,comparisons,sources};
}

// Already approved findings keep their original evidence and can be carried
// into a budget-limited final review. Pay only for the material gaps.
export function essentialEvidenceCandidates(candidates,context){
 const {rows,areas,hints,reviewed,approvedQuadrants}=candidates,confirmed=rows.filter(f=>reviewed.has(f.id)),pending=rows.filter(f=>!reviewed.has(f.id));
 const complaint=pending.find(f=>f.stance==='risk'&&f.sourceIds.some(id=>['sikayetvar.com','trustpilot.com'].includes(researchHost(context.known.get(id)?.url))));
 const seenDimensions=new Set(confirmed.map(f=>f.dimension));
 const focused=new Map(),targetHints=new Map(hints),targetAreas=new Map(areas);
 const add=(f,hint)=>{if(!f)return;focused.set(f.id,f);if(hint)targetHints.set(f.id,hint);};
 if(complaint&&!seenDimensions.has('perception')){
  add({...complaint,dimension:'perception'},'weakness');seenDimensions.add('perception');targetAreas.set(complaint.id,'perception_2');
 }else if(!confirmed.some(f=>hints.get(f.id)==='weakness'))add(complaint||pending.find(f=>f.stance==='risk'),'weakness');
 for(const {id} of dimensions)if(!seenDimensions.has(id))add(pending.find(f=>f.dimension===id&&areas.has(f.id))||pending.find(f=>f.dimension===id));
 add(pending.find(f=>areas.get(f.id)==='digital_1'));
 const covered=new Set(approvedQuadrants.values());
 for(const quadrant of quadrants){
  if(covered.has(quadrant)||[...focused.keys()].some(id=>targetHints.get(id)===quadrant))continue;
  const eligible=rows.filter(f=>hints.get(f.id)===quadrant&&!focused.has(f.id));
  add(quadrant==='threat'?eligible.find(f=>areas.get(f.id)==='competition_2')||eligible[0]:eligible[0],quadrant);
 }
 const focusedRows=[...focused.values()];
 const metadata={areas:targetAreas,hints:targetHints,reviewed,approvedQuadrants};
 return {focused:{...metadata,rows:focusedRows},retained:{...metadata,rows:[...confirmed.filter(f=>!focused.has(f.id)),...focusedRows]}};
}

export function finalizeEvidenceVerdicts({draft,candidates,verdicts,benchmarks}){
 const {rows,areas}=candidates;
 if(verdicts.length!==rows.length||benchmarks.length!==draft.benchmarks.length)throw new BudgetError('model_output_invalid','Son denetim her bulgu ve kıyas için ayrı karar gerektirir.');
 const accepted=rows.filter((_,i)=>verdicts[i]!==0),swot=Object.fromEntries(quadrants.map((q,i)=>[q,rows.filter((_,j)=>verdicts[j]===i+2).map(f=>f.id)]));
 const coverageChanges=[];
 for(const key of new Set(areas.values())){
  const additions=accepted.filter(f=>areas.get(f.id)===key).map(f=>f.id);if(!additions.length)continue;
  const existing=draft.coverage[key];
  coverageChanges.push({key,value:{...existing,status:existing.status==='observed'?'observed':'partial',findingIds:[...new Set([...existing.findingIds,...additions])]}});
 }
 const reviewedDimensions=dimensions.map(({id})=>({id,score:null,findingIds:accepted.filter(f=>f.dimension===id).map(f=>f.id),comparisonFindingIds:[],bandReason:'Kamuya açık kanıtlarla sınırlı. Ölçülmeyen iç göstergeler puanlanmadı.'}));
 const decision=accepted.length>=12&&reviewedDimensions.every(d=>d.findingIds.length)&&Object.values(swot).every(ids=>ids.length)?'accepted':'limited';
 return {acceptedIds:accepted.map(f=>f.id),rejectedIds:rows.filter((_,i)=>verdicts[i]===0).map(f=>f.id),patches:[],rejectedPeerIds:[],dimensions:reviewedDimensions,coverageChanges,approvedBenchmarkIndices:benchmarks.flatMap((v,i)=>v?[i]:[]),swot,decision,notes:'Her bulgu özgün kaynakla denetlendi; doğrudan rakipler onaylı rekabet aşamasından taşındı.'};
}
