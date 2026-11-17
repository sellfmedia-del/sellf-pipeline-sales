const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const keyOf=value=>clean(value).toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu,'').replaceAll('ı','i');
const technical=/[\p{L}\p{N}]_[\p{L}\p{N}]|^(?:[\p{L}\p{N}]{2,}-)+[\p{L}\p{N}]+$/u;
const human=value=>{
 const text=clean(value);
 return text&&!technical.test(text)&&!/^[A-ZÇĞİÖŞÜ\d]+$/u.test(text)&&!/^[a-z]{0,3}\d+$/iu.test(text)?text:'';
};
const topics={
 marka:'Marka ve ürün konumu',rakip:'Rakip araştırması',rakipler:'Rakip araştırması',kanal:'Satış kanalları',
 pazar:'Pazar analizi',fiyat:'Ürün ve rakip fiyatları',pazaryeri:'Pazaryeri satış kanalları',bilinirlik:'Marka bilinirliği',
 dijital:'Dijital varlıklar',instagram_marka:'Markanın Instagram hesabı',youtube_marka:'Markanın YouTube hesabı',
 influencer_pazar:'Pazardaki içerik üreticileri',reklam_maliyet:'Reklam maliyetleri',musteri_memnuniyeti:'Müşteri memnuniyeti',
 ga4:'Google Analytics 4 ölçümü',seo:'Arama motoru görünürlüğü',swot:'SWOT',
 competition:'Rakip araştırması',financial:'Finansal sağlık',operations:'Operasyonel verimlilik',
 funnel:'Satış hunisi',digital:'Dijital varlıklar',perception:'Marka algısı ve müşteri memnuniyeti',readiness:'Hedefler için gereklilikler ve eksikler'
};
const topic=value=>Object.hasOwn(topics,keyOf(value))?topics[keyOf(value)]:'';

export function salesSectionTitle(section,title){
 return topic(title)||human(title)||topic(section)||human(section)||'Araştırma konusu';
}

export function salesMetricName({name,metric,period,expected,section}){
 const label=name??metric;
 if(keyOf(label)==='instagram_marka'&&/etkilesim/.test(keyOf(expected))){
  if(/^(son )?30 gun(?:un)?$/u.test(keyOf(period)))return 'Instagram’da son 30 günün etkileşimi';
  return 'Instagram etkileşimi';
 }
 return topic(label)||human(label)||human(expected)||topic(section)||'Doğrulanacak ölçüm';
}

export function salesTaskSectionTitle(section,title,metric){
 return (keyOf(title)==='arastirma konusu'?'':topic(title)||human(title))||
  (keyOf(section)==='arastirma konusu'?'':topic(section)||human(section))||metric;
}

export function salesGapStatus(metric){
 if(metric.status==='confirmed')return 'missing_from_report';
 if(metric.researchStatus)return metric.researchStatus;
 if(metric.searched===false)return 'not_searched';
 return metric.searched||metric.proofIds?.length||metric.sources?.length?'insufficient_sources':'unknown';
}

export const salesGapLabels=Object.freeze({
 not_searched:'Aranmadı',
 searched:'Arama yapıldı, yeterli kanıt bulunamadı',
 search_incomplete:'Arama tamamlanamadı',
 source_unreadable:'Kaynak okunamadı',
 partially_verified:'Ölçüm kısmen doğrulandı',
 missing_from_report:'Doğrulandı, rapora aktarılamadı',
 interrupted:'Araştırma kaydı kesintide tamamlanamadı'
});
