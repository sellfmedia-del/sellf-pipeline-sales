import {createPublicFetcher} from '../network.mjs';
import {dimensions} from './brief.mjs';
import {assertSchema} from './schema.mjs';
import {extractPdfText} from './pdf.mjs';

export const normalized=value=>String(value).normalize('NFKC').replace(/\s+/g,' ').trim();
export function publicUrl(value){
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.href.length>2048)return '';return u.href;}catch{return '';}
}
function plainHtml(bytes){
  return bytes.toString('utf8').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<=0x10ffff?String.fromCodePoint(x):' ';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n]));
}
export function createSourceVerifier({read=createPublicFetcher({maxRequests:80,maxBytes:24*1024*1024,deadline:Date.now()+35000})}={}){
  return async source=>{
    let url=source.url;
    for(let redirects=0;redirects<=3;redirects++){
      const response=await read(url);
      if([301,302,303,307,308].includes(response.status)&&response.headers.location){url=new URL(response.headers.location,url).href;continue;}
      if(response.status!==200)return {status:'unavailable',finalUrl:url};
      const contentType=response.headers['content-type']||'';
      if(/application\/pdf/i.test(contentType)){
        try{
          const {text,pages}=await extractPdfText(response.body);
          return {status:normalized(text).includes(normalized(source.quote))?'quote_matched':'quote_not_found',finalUrl:url,format:'pdf',pages};
        }catch{return {status:'pdf_unreadable',finalUrl:url};}
      }
      if(!/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType))return {status:'unsupported_format',finalUrl:url};
      const text=normalized(/html/.test(contentType)?plainHtml(response.body):response.body.toString('utf8'));
      return {status:text.includes(normalized(source.quote))?'quote_matched':'quote_not_found',finalUrl:url};
    }
    return {status:'redirect_limit'};
  };
}

export async function verifyReport(report,{brief,rawReport,citations,verifySource=createSourceVerifier(),asOf=new Date().toISOString().slice(0,10)}){
  assertSchema(report);
  const data=structuredClone(report),issues=[];
  const add=message=>issues.push(message);
  const unique=(items,label)=>{const ids=items.map(x=>x.id);if(new Set(ids).size!==ids.length)add(label+' kimlikleri yineleniyor.');return new Map(items.map(x=>[x.id,x]));};
  const sources=unique(data.sources,'Kaynak'),findings=unique(data.findings,'Bulgu'),peers=unique(data.competitors,'Rakip');
  if(peers.has('brand'))add('Rakip kimliği marka kimliğiyle çakışıyor.');
  const providerUrls=new Set(citations.map(publicUrl).filter(Boolean));
  const reportText=normalized(rawReport);
  const validSourceIds=new Set();
  let next=0;
  // Independent bounded HTTP reads. A quote match is a mechanical support check,
  // not proof of the source's truth, entity identity or semantic entailment.
  await Promise.all(Array.from({length:4},async()=>{
    while(next<data.sources.length){
      const s=data.sources[next++];
      const url=publicUrl(s.url);
      let check={status:'not_in_provider_citations'};
      if(url&&providerUrls.has(url)&&normalized(s.quote).length>=24&&reportText.includes(normalized(s.quote))){
        try{check=await verifySource(s);}catch{check={status:'unavailable'};}
      }
      if(s.publishedAt!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(s.publishedAt)||Number.isNaN(Date.parse(s.publishedAt))||new Date(s.publishedAt).toISOString().slice(0,10)!==s.publishedAt||s.publishedAt>asOf))check={status:'invalid_date'};
      s.verification={...check,checkedAt:new Date().toISOString()};
      if(check.status==='quote_matched')validSourceIds.add(s.id);else add('Kaynak kontrolü tamamlanamadı: '+s.id+' ('+check.status+').');
    }
  }));
  const refs=(ids,map)=>Array.isArray(ids)&&ids.every(id=>map.has(id))&&new Set(ids).size===ids.length;
  const supported=ids=>ids.length>0&&ids.every(id=>validSourceIds.has(id));
  for(const f of data.findings){
    if(!refs(f.sourceIds,sources))add('Bulgunun kaynak bağlantısı geçersiz: '+f.id);
    if(!reportText.includes(normalized(f.reportExcerpt)))add('Bulgu araştırma metninde bulunamadı: '+f.id);
    if(f.kind==='brief'){
      if(f.sourceIds.length)add('Müşteri beyanı dış kaynak gibi işaretlenmiş: '+f.id);
    }else if(!supported(f.sourceIds))add('Bulgunun kaynak kanıtı eksik: '+f.id);
  }
  if(data.competitors.length<3)add('Benzer ölçek, kitle ve coğrafyada en az üç kaynaklı rakip gerekli.');
  const peerUrls=new Set();
  for(const p of data.competitors){
    const url=publicUrl(p.website);
    if(!url||peerUrls.has(url)||new URL(url).hostname.replace(/^www\./,'')===new URL(brief.website).hostname.replace(/^www\./,''))add('Rakip alan adı geçersiz veya tekrarlı: '+p.id);
    peerUrls.add(url);
    if(!refs(p.sourceIds,sources)||!supported(p.sourceIds))add('Rakibin kaynak kanıtı eksik: '+p.id);
  }
  const dimMap=unique(data.dimensions,'Boyut');
  for(const d of dimensions){
    const row=dimMap.get(d.id);
    if(!row){add('BHS boyutu eksik: '+d.name);continue;}
    if(!refs(row.findingIds,findings)||row.findingIds.some(id=>findings.get(id)?.dimension!==d.id))add('Boyut bulguları geçersiz: '+d.id);
    if(!refs(row.comparisonCompetitorIds,peers))add('Boyut rakip kıyaslaması geçersiz: '+d.id);
    const evidence=row.findingIds.some(id=>{const f=findings.get(id);return f&&f.kind!=='brief'&&supported(f.sourceIds);});
    if(row.score!==null&&(!evidence||row.comparisonCompetitorIds.length===0||row.dataStatus==='insufficient'||data.competitors.length<3))add('Kanıtsız veya eksik veriye puan verilmiş: '+d.id);
    if(row.dataStatus!=='full'&&!row.onboardingQuestions.length)add('Eksik veri için onboarding sorusu yok: '+d.id);
  }
  if(new Set(data.benchmarks.map(x=>x.metric)).size!==8)add('Benchmark metrikleri yineleniyor veya eksik.');
  const entities=['brand',...peers.keys()];
  for(const b of data.benchmarks){
    if(b.entries.length!==entities.length||new Set(b.entries.map(x=>x.entityId)).size!==entities.length||b.entries.some(x=>!entities.includes(x.entityId)))add('Benchmark marka/rakip kapsamı eksik: '+b.metric);
    for(const e of b.entries)if(!refs(e.sourceIds,sources)||(e.value!==null&&!supported(e.sourceIds))||(e.value===null&&e.sourceIds.length))add('Benchmark kanıtı geçersiz: '+b.metric+'/'+e.entityId);
  }
  for(const id of [data.criticalOpportunityFindingId,data.criticalRiskFindingId])if(id!==null&&!findings.has(id))add('Kritik bulgu referansı geçersiz.');
  for(const q of data.meetingQuestions)if(!refs(q.findingIds,findings))add('Toplantı sorusunun bulgu bağlantısı geçersiz.');
  for(const s of data.serviceRecommendations)if(!s.findingIds.length||!refs(s.findingIds,findings)||s.findingIds.some(id=>{const f=findings.get(id);return !f||f.kind==='brief'||!supported(f.sourceIds);}))add('Hizmet hipotezinin bulgu kanıtı eksik: '+s.id);
  const brandHost=new URL(brief.website).hostname.replace(/^www\./,'');
  if(!data.sources.some(s=>validSourceIds.has(s.id)&&new URL(s.url).hostname.replace(/^www\./,'')===brandHost))add('Markanın kendi domaininden kimlik kanıtı doğrulanamadı.');
  const completeScores=dimMap.size===6&&dimensions.every(d=>dimMap.get(d.id)?.score!==null);
  const total=completeScores&&issues.length===0?Math.round(dimensions.reduce((sum,d)=>sum+dimMap.get(d.id).score*d.weight,0)*100)/100:null;
  data.scoring={total,weights:dimensions.map(({id,weight})=>({id,weight})),note:total===null?'Eksik veya doğrulanmamış boyutlar nedeniyle toplam hesaplanmadı.':'Bu skor dışsal sinyallere dayalı ön tahmindir. Onboarding zeka kartı tamamlandığında BHS skoru güncellenecektir.'};
  data.services=data.serviceRecommendations.map(s=>s.name);
  data.quality={checksPassed:issues.length===0,issues:[...new Set(issues)],scope:'citation-and-quote-checks',semanticBenchmark:'pending',customerApproval:'pending'};
  return {status:issues.length?'review':'ready',data};
}
