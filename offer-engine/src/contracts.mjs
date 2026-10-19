export const stages=Object.freeze(['logo','audit','pricing','proposal']);
export function assertResult(stage,result){
  if(!['ready','review'].includes(result?.status)||!result.data||typeof result.data!=='object')throw new Error('Motor geçerli bir sonuç döndürmedi: '+stage);
  if(stage==='logo'){
    const logo=result.data.candidates?.[0],q=logo?.quality;
    if(result.data.generated!==false||!logo?.image?.startsWith('data:image/png;base64,')||q?.transparency!==true||q?.matteStable!==true||q?.touchesEdge!==false||q?.changedSolid!==0)throw new Error('Şeffaflaştırılmamış veya bozulmuş logo kullanılamaz.');
    if(result.status==='ready'&&result.data.reviewed!==true)throw new Error('Logo görsel kontrolü tamamlanmadı.');
  }
  if(stage==='audit'&&(!Array.isArray(result.data.findings)||!Array.isArray(result.data.services)))throw new Error('Audit bulguları ve hizmet kapsamı eksik.');
  if(stage==='audit'&&result.data.schemaVersion==='bhs-v1'&&result.status==='ready'&&(result.data.quality?.checksPassed!==true||result.data.quality?.semanticBenchmark!=='passed'))throw new Error('BHS kaynak ve içerik kontrolleri tamamlanmadı.');
  if(stage==='pricing'){
    const p=result.data;
    if(p.currency!=='TRY'||!p.costVersion||!Array.isArray(p.alternatives)||p.alternatives.length!==3||p.alternatives.some(a=>a.billingPeriod!=='monthly'||!Number.isFinite(a.monthlyAmount)||a.monthlyAmount<0))throw new Error('Üç toplam aylık fiyat ve maliyet sürümü gerekli.');
    if(p.schemaVersion==='pricing-v1'){
      if(p.alternatives.map(a=>a.id).join(',')!=='growth_operations,operations_bundle,individual_operations'||!p.costSnapshotHash||!p.alternatives.some(a=>a.id===p.recommendedAlternativeId))throw Error('Fiyat alternatifleri veya maliyet kaydı eksik.');
      for(const a of p.alternatives){
        if(['cost','minimumAmount','idealAmount','accountCost'].some(key=>!Number.isFinite(a[key])||a[key]<0)||Math.round(a.monthlyAmount*100)<Math.round(a.minimumAmount*100)||a.monthlyAmount>a.idealAmount||!a.services?.length)throw Error('Maliyet tabanı veya aylık toplam geçersiz.');
        if(a.id==='individual_operations'&&Math.round(a.monthlyAmount*100)!==a.services.reduce((sum,s)=>sum+Math.round(s.monthlyAmount*100),0))throw Error('Tekil hizmetlerin toplamı uyuşmuyor.');
      }
    }
  }
  if(stage==='proposal'&&!Array.isArray(result.data.sections))throw new Error('Teklif bölümleri eksik.');
}
