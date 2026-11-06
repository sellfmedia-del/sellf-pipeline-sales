import {hasGroundedResearch} from './bhs/research-content.mjs';
import {assertQuote} from './pricing/currency.mjs';
import {assertProjectPlans} from './pricing/project-contract.mjs';
import {assertMonthlyPlan} from './pricing/monthly.mjs';
export const originalLogoImage=value=>typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
export const stages=Object.freeze(['logo','audit','pricing','proposal']);
export function assertResult(stage,result){
  if(!['ready','review'].includes(result?.status)||!result.data||typeof result.data!=='object')throw new Error('Motor geçerli bir sonuç döndürmedi: '+stage);
  if(stage==='logo'){
    const logo=result.data.candidates?.[0],q=logo?.quality;
    const original=result.data.processing==='original'&&['upload-original','saved-original'].includes(result.data.sourceType)&&q?.method==='original'&&originalLogoImage(logo?.image)&&(logo.source===undefined||logo.source===logo.image);
    if(result.data.generated!==false||(!original&&(!logo?.image?.startsWith('data:image/png;base64,')||q?.transparency!==true||q?.matteStable!==true||q?.touchesEdge!==false||q?.changedSolid!==0)))throw new Error('Şeffaflaştırılmamış veya bozulmuş logo kullanılamaz.');
    if(result.status==='ready'&&result.data.reviewed!==true)throw new Error('Logo görsel kontrolü tamamlanmadı.');
  }
  if(stage==='audit'&&(!Array.isArray(result.data.findings)||!Array.isArray(result.data.services)))throw new Error('Audit bulguları ve hizmet kapsamı eksik.');
  if(stage==='audit'&&result.data.schemaVersion==='bhs-v1'&&result.status==='ready'&&(result.data.quality?.checksPassed!==true||result.data.quality?.semanticBenchmark!=='passed'))throw new Error('BHS kaynak ve içerik kontrolleri tamamlanmadı.');
  if(stage==='audit'&&result.data.schemaVersion==='bhs-v2-direct'&&(!result.data.report||!result.data.briefHash||!['json-format-only','offer-transfer-only','read-source-and-quote-filter'].includes(result.data.quality?.scope)))throw new Error('BHS JSON aktarımı eksik.');
  if(stage==='audit'&&result.data.quality?.scope==='read-source-and-quote-filter'){
    const sources=result.data.sources||[],ids=new Set(sources.map(s=>s.id));
    if(result.status==='ready'&&!hasGroundedResearch(result.data)&&result.data.researchContinuity?.status!=='unavailable')throw Error('Boş araştırma hazır BHS olarak kullanılamaz.');
    if(sources.some(s=>s.verification?.status!=='quote_matched')||result.data.findings.some(f=>f.kind==='brief'||!f.sourceIds?.length||f.sourceIds.some(id=>!ids.has(id))))throw Error('Okunmuş kaynak doğrulaması eksik.');
  }
  if(stage==='pricing'){
    const p=result.data;
    assertMonthlyPlan(p);assertProjectPlans(p);
    assertQuote(p);
    if(p.currency!=='TRY'||!p.costVersion||!Array.isArray(p.alternatives)||p.alternatives.length!==2||p.alternatives.some(a=>a.billingPeriod!=='monthly'||!Number.isFinite(a.monthlyAmount)||a.monthlyAmount<0))throw new Error('İki toplam aylık fiyat ve maliyet sürümü gerekli.');
    if(['pricing-v1','pricing-v2'].includes(p.schemaVersion)){
      if(p.alternatives.map(a=>a.id).join(',')!=='growth_operations,operations_bundle'||!p.costSnapshotHash||!p.alternatives.some(a=>a.id===p.recommendedAlternativeId))throw Error('Fiyat alternatifleri veya maliyet kaydı eksik.');
      for(const a of p.alternatives){
        if(['cost','minimumAmount','idealAmount','accountCost'].some(key=>!Number.isFinite(a[key])||a[key]<0)||Math.round(a.monthlyAmount*100)<Math.round(a.minimumAmount*100)||a.monthlyAmount>a.idealAmount||!a.services?.length&&!p.projectPlan?.items?.length&&!p.monthlyPlan?.months.some(row=>row.projectPlan?.items?.length))throw Error('Maliyet tabanı veya aylık toplam geçersiz.');
        if(a.id==='individual_operations'&&Math.round(a.monthlyAmount*100)!==a.services.reduce((sum,s)=>sum+Math.round(s.monthlyAmount*100),0))throw Error('Tekil hizmetlerin toplamı uyuşmuyor.');
      }
    }
  }
  if(stage==='proposal'){
    const p=result.data;
    assertMonthlyPlan(p,{customer:true});assertProjectPlans(p,{customer:true});
    if(p.language!==undefined&&!['tr','en'].includes(p.language))throw Error('Teklif dili geçersiz.');
    if(!Array.isArray(p.sections))throw new Error('Teklif bölümleri eksik.');
    if(p.schemaVersion==='proposal-v1'){
      assertQuote(p,{requireReady:true});
      if(p.alternatives?.map(a=>a.id).join(',')!=='growth_operations,operations_bundle'||!(p.logo?.image?.startsWith('data:image/png;base64,')||p.logo?.processing==='original'&&originalLogoImage(p.logo.image))||!p.alternatives.some(a=>a.id===p.recommendedAlternativeId))throw Error('Teklif kapsamı veya logo eksik.');
      for(const a of p.alternatives)if(a.billingPeriod!=='monthly'||!Number.isFinite(a.monthlyAmount)||a.monthlyAmount<0||!p.plans?.[a.id]?.steps?.length||a.services.some(s=>['cost','monthlyAmount','minimumAmount','idealAmount'].some(key=>key in s)))throw Error('Müşteri teklifi toplamları veya hizmet alanları geçersiz.');
    }
  }
}
