import {BudgetError,hash} from '../budget/ledger.mjs';
import {assertSchema} from './schema.mjs';
import {claimReviewSchema,researchWorkReviewSchema,reviewPolicyVersion} from './conversation-review-contract.mjs';
import {researchWorkPolicyVersion,validateWorkReview} from './conversation-work.mjs';
import {canonicalConversationHash} from './conversation-context.mjs';
import {usableConversationSource} from './conversation-source.mjs';
import {projectModelBrief} from './conversation-input.mjs';
import {qualifiedResearchSources} from './conversation-progress.mjs';

const text=value=>typeof value==='string'&&Boolean(value.trim());
const normalize=value=>value.replace(/\s+/gu,' ').trim();
const leaf=/^(?:summary|reportMarkdown|highlights\.\d+\.(?:statement|analysis|action|measurement|kind|dimension|quadrant|sourceIds(?:\.\d+)?)|competitors\.\d+\.(?:name|url|reason|sourceIds(?:\.\d+)?)|sourceQuotes\.\d+\.(?:sourceId|quote)|questions\.\d+|limitations\.\d+)$/u;
const arrayPath=/^(?:highlights|competitors|sourceQuotes|questions|limitations|(?:highlights|competitors)\.\d+\.sourceIds)$/u;
function fail(reason,category='patch',detail={}){
 const error=new BudgetError('semantic_review_invalid',reason);
 error.reviewFeedback={category,...detail,reason};throw error;
}
function atPath(report,path){
 const parts=path.split('.');let owner=report;
 for(const part of parts.slice(0,-1)){if(owner===null||typeof owner!=='object'||!Object.hasOwn(owner,part))fail('Yama yolu taslakta yok.','patch',{path});owner=owner[part];}
 const key=parts.at(-1);if(owner===null||typeof owner!=='object'||!Object.hasOwn(owner,key))fail('Yama hedefi taslakta yok.','patch',{path});
 return {owner,key,value:owner[key]};
}
function matchSpan(value,before){
 if(before==='')return value===''?{start:0,end:0}:null;
 const exact=value.indexOf(before);
 if(exact>=0)return exact===value.lastIndexOf(before)?{start:exact,end:exact+before.length}:null;
 // Whitespace-only equivalence with original UTF-16 coordinates. Never use
 // fuzzy wording/case matches or a first match when the quote is ambiguous.
 let flat='',ranges=[];
 for(const row of value.matchAll(/\s+|[^\s]/gu)){flat+=/^\s/u.test(row[0])?' ':row[0];
  for(let i=0;i<(/^\s/u.test(row[0])?1:row[0].length);i++)ranges.push({start:row.index,end:row.index+row[0].length});}
 const query=normalize(before),start=flat.indexOf(query);
 return query&&start>=0&&start===flat.lastIndexOf(query)?{start:ranges[start].start,end:ranges[start+query.length-1].end}:null;
}
function oneBlock(markdown,start,end){
 const headings=[...markdown.matchAll(/^#{1,6}\s+.+$/gmu)].map(row=>row.index);
 const bounds=headings.length?[0,...headings,markdown.length]:[0,...[...markdown.matchAll(/\n\s*\n/gu)].map(row=>row.index+row[0].length),markdown.length];
 return bounds.some((left,index)=>index<bounds.length-1&&start>=left&&end<=bounds[index+1]);
}
export function applyClaimReview(draft,decision,{sources=[],attempts=1,brief,progress,policy=reviewPolicyVersion}={}){
 try{assertSchema(decision,policy===researchWorkPolicyVersion?researchWorkReviewSchema:claimReviewSchema);}catch{fail('Denetimin veri biçimini ve bu oturumun kapsam/iddia/iş alanlarını tamamla.','format');}
 if(decision.draftDigest!==hash(draft))fail('Yama başka bir taslağa ait; mevcut taslak kimliğini kullan.','format');
 if(!text(decision.rationale)||!text(decision.claimScope)||!decision.claimChecks.length)fail('Anlam denetiminin kapsamını ve seçilen gerçek iddia değerlendirmesini kaydet.','claim');
 const issues=new Map();
 for(const row of decision.issues){
  if(!/^[a-zA-Z0-9_-]{1,60}$/u.test(row.id)||issues.has(row.id)||!text(row.reason))fail('Her sorun tek kimlik ve somut gerekçe gerektirir.','format');
  if(row.sourceIds.some(id=>!sources.some(source=>source.id===id)))fail('Sorunun kaynağı bilinen arşivde yok.','claim',{issueId:row.id});
  issues.set(row.id,row);
 }
 const result=structuredClone(draft),operations=[],patched=new Set();
 for(const patch of decision.patches){
  const issue=issues.get(patch.issueId),detail={issueId:patch.issueId,path:patch.path};
  if(!issue||!text(issue.resolution))fail('Her yama, çözümü açıklanmış soruna bağlı olmalı.','patch',detail);
  if(patch.operation==='replace_text'){
   if(!leaf.test(patch.path))fail('Yalnız izinli metin alanını düzelt.','patch',detail);
   const target=atPath(result,patch.path),span=typeof target.value==='string'?matchSpan(target.value,patch.before):null;
   if(!span)fail('Eski metin bu alanda tek bir aralığa eşleşmiyor; doğru path ve ayırt edici gerçek pasajı kullan.','patch',detail);
   if(patch.path==='reportMarkdown'&&(span.end-span.start===target.value.length||!oneBlock(target.value,span.start,span.end)))fail('Bütün rapor veya birden fazla bölüm yerine yalnız sorunlu iddiayı düzelt.','patch',detail);
   if(target.value.slice(span.start,span.end)===patch.after)fail('Bu yama sorunlu metni değiştirmiyor.','patch',detail);
   operations.push({...patch,target,...span});
  }else if(patch.operation==='remove'){
   if(!/^(?:highlights|competitors|sourceQuotes|questions|limitations)\.\d+$/u.test(patch.path)||patch.after!=='')fail('Yalnız işaretlenen tek dizi öğesi kaldırılabilir.','patch',detail);
   const target=atPath(result,patch.path);let before;try{before=JSON.parse(patch.before);}catch{fail('Kaldırılacak öğeyi geçerli JSON olarak ver.','patch',detail);}
   if(canonicalConversationHash(target.value)!==canonicalConversationHash(before))fail('Kaldırılacak öğe taslağın özgün kaydıyla eşleşmiyor.','patch',detail);
   operations.push({...patch,target});
  }else{
   if(!arrayPath.test(patch.path)||patch.before!=='')fail('Yalnız izinli diziye tek öğe eklenebilir.','patch',detail);
   const target=atPath(result,patch.path);if(!Array.isArray(target.value))fail('Ekleme hedefi bir dizi değil.','patch',detail);
   let value;try{value=JSON.parse(patch.after);}catch{fail('Eklenecek öğeyi geçerli JSON olarak ver.','patch',detail);}
   operations.push({...patch,target,appendValue:value});
  }
  patched.add(patch.issueId);
 }
 for(let i=0;i<operations.length;i++)for(const other of operations.slice(i+1)){
  const row=operations[i];
  if(row.operation==='remove'&&(other.path===row.path||other.path.startsWith(row.path+'.'))||other.operation==='remove'&&(row.path===other.path||row.path.startsWith(other.path+'.'))||
   row.operation==='replace_text'&&other.operation==='replace_text'&&row.path===other.path&&(row.start===other.start||Math.max(row.start,other.start)<Math.min(row.end,other.end)))
   fail('Yamalar çakışıyor; kaldırılacak öğeyi ayrıca düzenleme ve aynı metin aralığını iki kez değiştirme.','patch',{path:row.path});
 }
 const pending=[...issues.values()].filter(row=>!patched.has(row.id));
 if(decision.verdict==='approve'&&(issues.size||operations.length))fail('Sorun/yama varken değişikliksiz onay verilemez.','format');
 if(decision.verdict==='patch'&&(!operations.length||pending.length))fail('Her işaretli sorun çözülmeli; önemli açık public soru varsa research_needed kullan.','patch');
 if(decision.verdict==='research_needed'&&(!pending.length||pending.some(row=>row.access!=='public'||!text(row.question))))
  fail('Araştırmaya yalnız yamayla çözülmemiş dar public soru döner; iç veri veya analitik iddia için müşteri sorusu/koşullu yama kullan.','research');
 if(policy===researchWorkPolicyVersion)validateWorkReview(decision.workReview,{draft,issues,pending,patched,progress,sources,readTarget:atPath,fail});
 const known=new Map(sources.map(source=>[source.id,source])),qualified=new Set(qualifiedResearchSources(progress,sources).map(proof=>proof.sourceId)),
  safeBrief=brief?Object.values(projectModelBrief(brief).brief).filter(value=>typeof value==='string'):[];
 const findingChecks=[];
 for(const check of decision.claimChecks){
  if(!leaf.test(check.path)||!text(check.text)||!text(check.basis))fail('İddia için gerçek metin yolu, pasaj ve dayanak gerekçesi gerekli.','claim',{path:check.path});
  const target=atPath(draft,check.path);
  if(typeof target.value!=='string'||!normalize(target.value).includes(normalize(check.text)))fail('Değerlendirilen iddia bu taslak alanında yok.','claim',{path:check.path});
  if(check.issueId&&!issues.has(check.issueId))fail('İddianın issueId kaydı bulunmuyor.','claim',{path:check.path});
  if(check.sourceIds.some(id=>!usableConversationSource(known.get(id))))fail('İddia dayanağı okunmuş arşiv kaynağı olmalı.','claim',{path:check.path});
  if(check.kind==='source_fact'&&(!check.sourceIds.length||check.sourceIds.some(id=>!qualified.has(id))))fail('Kaynaklı olgu için gerçekten okunmuş ve ilgili bulunmuş kaynak gerekli.','claim',{path:check.path});
  if(check.kind==='brief_statement'&&(!text(check.briefQuote)||!safeBrief.some(value=>normalize(value).includes(normalize(check.briefQuote)))))fail('Brief beyanını gerçek brief pasajına bağla; brifte yokluğu zayıflık diye sunma.','claim',{path:check.path});
  if(['hypothesis','client_question'].includes(check.kind)&&!text(check.verification))fail('Hipotez veya müşteri sorusu için nasıl doğrulanacağını belirt.','claim',{path:check.path});
  const finding=/^highlights\.(\d+)\.statement$/u.exec(check.path);
  if(finding&&!pending.some(row=>row.id===check.issueId))findingChecks.push({check,row:result.highlights[Number(finding[1])]});
 }
 // All coordinates refer to the unchanged original. Disjoint replacements
 // run back-to-front; removals use original indices; appends run last.
 for(const row of operations.filter(row=>row.operation==='replace_text').sort((a,b)=>b.start-a.start))
  row.target.owner[row.target.key]=row.target.owner[row.target.key].slice(0,row.start)+row.after+row.target.owner[row.target.key].slice(row.end);
 for(const row of operations.filter(row=>row.operation==='remove').sort((a,b)=>Number(b.target.key)-Number(a.target.key)))row.target.owner.splice(Number(row.target.key),1);
 for(const row of operations.filter(row=>row.operation==='append'))row.target.value.push(row.appendValue);
 for(const {check,row} of findingChecks)if(result.highlights.includes(row)){
  const expected={source_fact:'observation',brief_statement:'brief',hypothesis:'inference',client_question:'inference'}[check.kind];
  if(row.kind!==expected)fail('Seçili bulgunun kind alanı iddia türüyle tutarlı değil; yalnız ilgili kaydı düzelt.','claim',{path:check.path});
 }
 return {report:result,review:{version:policy,status:pending.length?'research_needed':'approved',
  draftDigest:hash(draft),reportDigest:canonicalConversationHash(result),digestEncoding:'canonical-json-v1',rationale:decision.rationale,
  issues:decision.issues,researchIssues:pending,patches:decision.patches,claimScope:decision.claimScope,claimChecks:decision.claimChecks,
  ...(policy===researchWorkPolicyVersion?{workReview:decision.workReview}:{}),attempts}};
}
export function reviewFailureFeedback(error){
 return error.reviewFeedback||{category:'validation',reason:error.message||'Denetim yanıtı uygulanamadı; mevcut taslak korundu.'};
}
