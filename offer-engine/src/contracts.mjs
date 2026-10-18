export const stages=Object.freeze(['logo','audit','pricing','proposal']);
export function assertResult(stage,result){
  if(!['ready','review'].includes(result?.status)||!result.data||typeof result.data!=='object')throw new Error('Motor geçerli bir sonuç döndürmedi: '+stage);
  if(stage==='logo'){
    const logo=result.data.candidates?.[0],q=logo?.quality;
    if(result.data.generated!==false||!logo?.image?.startsWith('data:image/png;base64,')||q?.transparency!==true||q?.matteStable!==true||q?.touchesEdge!==false||q?.changedSolid!==0)throw new Error('Şeffaflaştırılmamış veya bozulmuş logo kullanılamaz.');
    if(result.status==='ready'&&result.data.reviewed!==true)throw new Error('Logo görsel kontrolü tamamlanmadı.');
  }
  if(stage==='audit'&&(!Array.isArray(result.data.findings)||!Array.isArray(result.data.services)))throw new Error('Audit bulguları ve hizmet kapsamı eksik.');
  if(stage==='pricing'){
    const p=result.data;
    if(p.currency!=='TRY'||!p.costVersion||!Array.isArray(p.alternatives)||p.alternatives.length!==3||p.alternatives.some(a=>a.billingPeriod!=='monthly'||!Number.isFinite(a.monthlyAmount)||a.monthlyAmount<0))throw new Error('Üç toplam aylık fiyat ve maliyet sürümü gerekli.');
  }
  if(stage==='proposal'&&!Array.isArray(result.data.sections))throw new Error('Teklif bölümleri eksik.');
}
