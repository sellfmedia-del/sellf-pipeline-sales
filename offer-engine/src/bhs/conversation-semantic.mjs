import {BudgetError,hash} from '../budget/ledger.mjs';
import {semanticReviewSchema} from './conversation-contract.mjs';
import {assertSchema} from './schema.mjs';
import {qualifiedResearchSources,quoteWasSeen} from './conversation-progress.mjs';
import {canonicalConversationHash} from './conversation-context.mjs';

export const semanticReviewVersion='same-conversation-targeted-review-v1';
export const semanticReviewOutputTokens=6000;
export const maximumSemanticReviews=2;
const fail=message=>{throw new BudgetError('semantic_review_invalid',message);};
const text=value=>typeof value==='string'&&Boolean(value.trim());
const leaf=/^(?:summary|reportMarkdown|highlights\.\d+\.(?:statement|analysis|action|measurement|kind|dimension|quadrant|sourceIds(?:\.\d+)?)|competitors\.\d+\.(?:name|url|reason|sourceIds(?:\.\d+)?)|sourceQuotes\.\d+\.(?:sourceId|quote)|questions\.\d+|limitations\.\d+)$/u;
const arrays=new Set(['highlights','competitors','sourceQuotes','questions','limitations']);
function atPath(report,path){
 const parts=path.split('.');let owner=report;
 for(const part of parts.slice(0,-1)){if(owner===null||!Object.hasOwn(owner,part))fail('Yama yolu taslakta yok.');owner=owner[part];}
 const key=parts.at(-1);if(owner===null||!Object.hasOwn(owner,key))fail('Yama hedefi taslakta yok.');return {owner,key,value:owner[key]};
}
function oneNarrativeBlock(markdown,start,end){
 const headings=[...markdown.matchAll(/^#{1,6}\s+.+$/gmu)].map(row=>row.index);
 const boundaries=headings.length?[0,...headings,markdown.length]:[0,...[...markdown.matchAll(/\n\s*\n/gu)].map(row=>row.index+row[0].length),markdown.length];
 return boundaries.some((left,index)=>index<boundaries.length-1&&start>=left&&end<=boundaries[index+1]);
}
export function applySemanticDecision(draft,decision,{sources=[],attempts=1}={}){
 try{assertSchema(decision,semanticReviewSchema);}catch{fail('Anlam denetiminin veri biçimi geçersiz.');}
 if(decision.draftDigest!==hash(draft))fail('Yama başka bir taslağa ait; mevcut analiz korunuyor.');
 if(!text(decision.rationale))fail('Anlama dayalı değerlendirme gerekçesi gerekli.');
 const issues=new Map();
 for(const issue of decision.issues){
  if(!/^[a-zA-Z0-9_-]{1,60}$/u.test(issue.id)||issues.has(issue.id)||!text(issue.reason))fail('Her sorun için tek kimlik ve somut gerekçe gerekli.');
  if(issue.sourceIds.some(id=>!sources.some(source=>source.id===id)))fail('Denetim dayanağı yalnız bilinen kaynaklara bağlanabilir.');
  issues.set(issue.id,issue);
 }
 if(decision.verdict==='approve'&&(issues.size||decision.patches.length))fail('Sorun veya yama varken değişikliksiz onay verilemez.');
 if(decision.verdict==='patch'&&(!issues.size||!decision.patches.length))fail('Hedefli düzeltme için sorun ve yama gerekli.');
 if(decision.verdict==='research_needed'&&(!issues.size||decision.patches.length||[...issues.values()].some(issue=>!text(issue.question)||issue.access!=='public')))fail('Yeni araştırma yalnız dar kamu sorusu içindir. Müşterinin iç bilgilerini veya genel analizi web araştırmasına çevirme; taslağı koru.');
 const result=structuredClone(draft),patched=new Set();
 for(const patch of decision.patches){
  if(!issues.has(patch.issueId)||!text(issues.get(patch.issueId).resolution))fail('Her yama, çözümü açıklanan soruna bağlı olmalı.');
  if(patch.operation==='replace_text'){
   if(!leaf.test(patch.path))fail('Yalnız izinli metin alanı düzeltilebilir.');
   const target=atPath(result,patch.path),before=patch.before;
   if(typeof target.value!=='string'||(before===''?(target.value!==''||patch.path==='reportMarkdown'):
    target.value.indexOf(before)<0||target.value.indexOf(before)!==target.value.lastIndexOf(before)))fail('Yamanın eski metni tek ve tam eşleşmeli.');
   const start=target.value.indexOf(before);
   if(patch.path==='reportMarkdown'&&(before===target.value||!oneNarrativeBlock(target.value,start,start+before.length)))fail('Bütün raporu veya birden fazla bölümü yeniden yazma.');
   target.owner[target.key]=target.value.slice(0,start)+patch.after+target.value.slice(start+before.length);
  }else if(patch.operation==='append'){
   if((!arrays.has(patch.path)&&!/^(?:highlights|competitors)\.\d+\.sourceIds$/u.test(patch.path))||patch.before!=='')fail('Yalnız tek bir ilgili dizi öğesi eklenebilir.');
   let value;try{value=JSON.parse(patch.after);}catch{fail('Eklenecek öğe geçerli JSON olmalı.');}
   const target=arrays.has(patch.path)?result[patch.path]:atPath(result,patch.path).value;target.push(value);
  }else{
   if(!/^(?:highlights|competitors|sourceQuotes|questions|limitations)\.\d+$/u.test(patch.path)||patch.after!=='')fail('Yalnız işaretlenen dizi öğesi kaldırılabilir.');
   const target=atPath(result,patch.path);if(JSON.stringify(target.value)!==patch.before)fail('Kaldırılacak öğe taslakla tam eşleşmeli.');
   target.owner.splice(Number(target.key),1);
  }
  patched.add(patch.issueId);
 }
 if(decision.verdict==='patch'&&[...issues.keys()].some(id=>!patched.has(id)))fail('Bütün işaretli sorunların hedefli çözümü gerekli.');
 return {report:result,review:{version:semanticReviewVersion,status:decision.verdict==='research_needed'?'research_needed':'approved',
  draftDigest:hash(draft),reportDigest:canonicalConversationHash(result),digestEncoding:'canonical-json-v1',rationale:decision.rationale,issues:decision.issues,patches:decision.patches,attempts}};
}
export function semanticReviewIssues(review,report){
 if(!review)return ['semantic_review_pending'];
 if(review.status!=='approved')return [review.status==='research_needed'?'semantic_research_needed':'semantic_review_pending'];
 return review.reportDigest===(review.digestEncoding==='canonical-json-v1'?canonicalConversationHash(report):hash(report))?[]:['semantic_review_stale'];
}
export function introducedReadIssues(original,patched,{sources,progress,views}){
 const qualified=new Set(qualifiedResearchSources(progress,sources).map(row=>row.sourceId)),known=new Map(sources.map(row=>[row.id,row]));
 const failures=report=>{
  const used=[...[...report.reportMarkdown.matchAll(/\[(S[a-f0-9]{8})\]/gu)].map(row=>row[1]),...report.highlights.flatMap(row=>row.sourceIds),...report.competitors.flatMap(row=>row.sourceIds)];
  return new Set([...used.filter(id=>!qualified.has(id)).map(id=>'source:'+id),...report.sourceQuotes.filter(row=>known.has(row.sourceId)&&!quoteWasSeen(known.get(row.sourceId),row.quote,views)).map(row=>'quote:'+hash(row))]);
 };
 const before=failures(original),added=[...failures(patched)].filter(key=>!before.has(key));
 return [...new Set(added.map(key=>key.startsWith('source:')?'unreviewed_report_source':'unseen_report_quote'))];
}
export const semanticReviewInstruction=(draft,attempts)=>'Taslak korunmuştur; yeniden finish_bhs çağırma. Aynı konuşmanın bütün bağlamıyla anlam denetimi yap. Yalnız review_bhs ile onay veya hedefli yama ver. '+
 JSON.stringify({draftDigest:hash(draft),reviewAttempt:attempts+1,maximumReviews:maximumSemanticReviews,instruction:'Güçlü anlatım, dört SWOT kolunun gerekçesi, somut aksiyon/ölçüm ve geçerli alternatifler korunmalı. Başlık/kelime sayısı kalite kanıtı değildir.'});
