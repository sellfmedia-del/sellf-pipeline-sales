import {assertSchema,reportSchema} from './schema.mjs';
import {synthesisEnvelope} from './grounded-report.mjs';
const targets=['summary','dimension.rationale','finding.statement','finding.impact','finding.goalConnection','service.hypothesis','question.question','competitor.scaleReason','competitor.audienceReason','competitor.geographyReason'];
export const editSchema={type:'object',properties:{edits:{type:'array',minItems:0,maxItems:40,items:{type:'object',properties:{target:{type:'string',enum:targets},id:{type:'string',minLength:1,maxLength:180},value:{type:'string',minLength:1,maxLength:6000}},required:['target','id','value'],additionalProperties:false}}},required:['edits'],additionalProperties:false};
export function interpretationIssues(report){
 const issues=[];
 for(const [i,q]of report.meetingQuestions.entries())if(/üstünlü[kğ]|avantajı/i.test(q.question)&&!/(?:var mı|kanıt|ölç|olup olmadığ|iddia)/i.test(q.question))issues.push('Soru ölçülmemiş üstünlük veya avantajı varsayıyor: q'+i);
 for(const peer of report.competitors){
  const unbounded=peer.scaleReason.toLocaleLowerCase('tr-TR').split(/[;.!?\n]+/).some(clause=>/kamuya açık.{0,60}(?:olma|bulunma|yer alma)/.test(clause)&&!/(?:bu tarama|paket|bu kaynak(?:ta|larda)|(?:okunan|incelenen|doğrulanan) kaynak(?:ta|larda))/.test(clause));
  if(unbounded)issues.push('Rakipte veri yokluğu tarama kapsamıyla sınırlanmalı: '+peer.id);
 }
 for(const d of report.dimensions)if(/kamuya açık (?:olmadığ|olmama|değil)/i.test(d.rationale))issues.push('Veri yokluğu bu taramanın kapsamıyla sınırlanmalı: '+d.id);
 for(const service of report.serviceRecommendations)if(/(?:beyan|iddia)[\s\S]{0,140}oranı(?:nın)?\s+avantaj/i.test(service.hypothesis))issues.push('Beyan edilen oran karşılaştırma olmadan avantaj sayılamaz: '+service.id);
 return issues;
}
export function editorialEnvelope(brief,packet,report){return {...synthesisEnvelope(brief,packet),kind:'sellf-bhs-editor-v1',report,instruction:`Kanıta dayalı BHS raporunda yalnızca gereğinden kesin yorumları düzelt. Yeni araştırma veya yeni teşhis yazma. Kaynaklar, rakipler, sayılar, puanlar, kimlikler, tarihler ve referanslar değişemez. Sadece gerekli alanlar için edits üret; düzeltilmesi gerekmeyen alanı tekrar yazma. En fazla 40 düzenleme.
1. 'Kamuya açık değil/olmadığından/olmaması' türü kapsamı kanıtlanmamış yokluk beyanlarını 'bu taramada doğrulanmış kaynak paketinde bulunmadığından' şeklinde sınırla. Bu tarama internetin tamamını incelemedi. Rakamın pakette bulunmaması düşük performans değildir.
2. Beyan edilen arıza/teknik çağrı/şikâyet oranı, laboratuvar, ödül veya sertifika; bağımsız gerçek servis kalitesini, memnuniyeti, müşteri güvenini, düşük servis yükünü veya rakip üstünlüğünü tek başına kanıtlamaz. Payda, örneklem, dönem ve karşılaştırma ölçülmediyse 'avantaj', 'düşük risk', 'kanıtlar', 'doğrular', 'güçlü itibar' gibi kesin sonuçları hipotez/sınanacak ihtimal olarak yaz. Şirket ve tanıtım açıklamalarını kaynağa atfet. Etki ve hedef bağlantısı alanları da buna dahildir.
3. Kaynakta gözlenmeyen bayi trafiği daralması, mevcut dijital eksiklik, kesinti, yüksek marj veya garanti edilmiş fayda varsayma. Sadece kaynakta gözlenen olgu ile gelecekte ölçülecek hipotezi ayır. Okuyucunun erişim sınırını müşteri/SEO arızası gibi yorumlama. Yeni hizmet kapsamı veya ticari taahhüt ekleme.
4. Tarihsel iddiayı güncel doğrulanmış başarı gibi sunma. Eski grup içi ticaret sözleşmelerinin bugün aynı koşulla sürdüğünü varsayma. Üretici finansalını marka toplamına taşıma. observation türündeki bir finding'e yeni nedensel/stratejik iddia ekleme; impact/goalConnection gerekiyorsa açık hipotez dili kullansın.
5. Toplantı soruları da doğrulanmamış durumu varsaymamalı. 'Sessizlik/hava kalitesi üstünlüğünüz nasıl satılıyor?' gibi bir soru yerine böyle bir farkın bağımsız ölçülüp ölçülmediğini ve bayi/satış etkisinin nasıl sınanacağını sor. Markada B2B portalı bulunduğu doğrulanmadıysa var olup olmadığını açık sor. Mevcut olmayan avantajı, kanıtlanmamış düşüşü veya bilinmeyen dijital özelliği olmuş gibi sorma. Rakip ölçek gerekçelerinde 'kamuya açık finansal yok' cümlesini bu taramanın kanıt paketiyle sınırla; aynı ciro/üretim ölçeğini veriler kıyaslanmadan iddia etme. Rakip karşılaştırması ürün/kitle/coğrafya temelinde gerekçelendirilebilir.
Düzenlemeler tam yeni alan metni olsun. target=summary için id=report. Diğer id'ler mevcut boyut/bulgu/hizmet/rakip kimlikleridir. question.question için id q0, q1, ... biçiminde meetingQuestions dizisinin sıfırdan başlayan indeksidir. Özetin üslubunu düzeltirken doğrulanmış tutarlar ve dönemler korunmalı. Doğru olguları silme. Yalnızca bu JSON şemasını döndür.`};}
export function applyEdits(report,patch){
 assertSchema(patch,editSchema,'editor');const result=structuredClone(report),seen=new Set(),allowedNumbers=new Set(JSON.stringify(report).match(/\d+(?:[.,]\d+)*/g)||[]);
 for(const edit of patch.edits){
  const key=edit.target+'/'+edit.id;if(seen.has(key))throw Error('Yinelenen rapor düzenlemesi.');seen.add(key);
  let target,field;
  if(edit.target==='summary'&&edit.id==='report'){target=result;field='summary';}
  else if(edit.target==='question.question'&&/^q\d+$/.test(edit.id)){target=result.meetingQuestions[Number(edit.id.slice(1))];field='question';}
  else{const [group,name]=edit.target.split('.');target=({dimension:result.dimensions,finding:result.findings,service:result.serviceRecommendations,competitor:result.competitors}[group]||[]).find(x=>x.id===edit.id);field=name;}
  if(!target||!Object.hasOwn(target,field))throw Error('Rapor düzenlemesinin hedefi geçersiz.');
  if((edit.value.match(/\d+(?:[.,]\d+)*/g)||[]).some(n=>!allowedNumbers.has(n)))throw Error('Üslup düzenlemesi yeni sayı ekleyemez.');
  target[field]=edit.value;
  if(edit.target==='finding.statement')target.reportExcerpt=edit.value;
 }
 assertSchema(result,reportSchema);return result;
}
