import {assertSchema,reportSchema} from './schema.mjs';
import {synthesisEnvelope} from './grounded-report.mjs';
const targets=['summary','dimension.rationale','finding.statement','finding.impact','finding.goalConnection','service.hypothesis'];
export const editSchema={type:'object',properties:{edits:{type:'array',minItems:0,maxItems:30,items:{type:'object',properties:{target:{type:'string',enum:targets},id:{type:'string',minLength:1,maxLength:80},value:{type:'string',minLength:1,maxLength:6000}},required:['target','id','value'],additionalProperties:false}}},required:['edits'],additionalProperties:false};
export function interpretationIssues(report){
 const issues=[];
 for(const d of report.dimensions)if(/kamuya açık (?:olmadığ|olmama|değil)/i.test(d.rationale))issues.push('Veri yokluğu bu taramanın kapsamıyla sınırlanmalı: '+d.id);
 for(const service of report.serviceRecommendations)if(/(?:beyan|iddia)[\s\S]{0,140}oranı(?:nın)?\s+avantaj/i.test(service.hypothesis))issues.push('Beyan edilen oran karşılaştırma olmadan avantaj sayılamaz: '+service.id);
 return issues;
}
export function editorialEnvelope(brief,packet,report){return {...synthesisEnvelope(brief,packet),kind:'sellf-bhs-editor-v1',report,instruction:`Kanıta dayalı BHS raporunda yalnızca gereğinden kesin yorumları düzelt. Yeni araştırma veya yeni teşhis yazma. Kaynaklar, rakipler, sayılar, puanlar, kimlikler, tarihler ve referanslar değişemez. Sadece gerekli alanlar için edits üret; düzeltilmesi gerekmeyen alanı tekrar yazma. En fazla 30 düzenleme.
1. 'Kamuya açık değil/olmadığından/olmaması' türü kapsamı kanıtlanmamış yokluk beyanlarını 'bu taramada doğrulanmış kaynak paketinde bulunmadığından' şeklinde sınırla. Bu tarama internetin tamamını incelemedi. Rakamın pakette bulunmaması düşük performans değildir.
2. Beyan edilen arıza/teknik çağrı/şikâyet oranı, laboratuvar, ödül veya sertifika; bağımsız gerçek servis kalitesini, memnuniyeti, müşteri güvenini, düşük servis yükünü veya rakip üstünlüğünü tek başına kanıtlamaz. Payda, örneklem, dönem ve karşılaştırma ölçülmediyse 'avantaj', 'düşük risk', 'kanıtlar', 'doğrular', 'güçlü itibar' gibi kesin sonuçları hipotez/sınanacak ihtimal olarak yaz. Şirket ve tanıtım açıklamalarını kaynağa atfet. Etki ve hedef bağlantısı alanları da buna dahildir.
3. Kaynakta gözlenmeyen bayi trafiği daralması, mevcut dijital eksiklik, kesinti, yüksek marj veya garanti edilmiş fayda varsayma. Sadece kaynakta gözlenen olgu ile gelecekte ölçülecek hipotezi ayır. Okuyucunun erişim sınırını müşteri/SEO arızası gibi yorumlama. Yeni hizmet kapsamı veya ticari taahhüt ekleme.
4. Tarihsel iddiayı güncel doğrulanmış başarı gibi sunma. Eski grup içi ticaret sözleşmelerinin bugün aynı koşulla sürdüğünü varsayma. Üretici finansalını marka toplamına taşıma. observation türündeki bir finding'e yeni nedensel/stratejik iddia ekleme; impact/goalConnection gerekiyorsa açık hipotez dili kullansın.
Düzenlemeler tam yeni alan metni olsun. target=summary için id=report. Diğer id'ler mevcut boyut/bulgu/hizmet kimlikleridir. Özetin üslubunu düzeltirken doğrulanmış tutarlar ve dönemler korunmalı. Doğru olguları silme. Yalnızca bu JSON şemasını döndür.`};}
export function applyEdits(report,patch){
 assertSchema(patch,editSchema,'editor');const result=structuredClone(report),seen=new Set(),allowedNumbers=new Set(JSON.stringify(report).match(/\d+(?:[.,]\d+)*/g)||[]);
 for(const edit of patch.edits){
  const key=edit.target+'/'+edit.id;if(seen.has(key))throw Error('Yinelenen rapor düzenlemesi.');seen.add(key);
  let target,field;
  if(edit.target==='summary'&&edit.id==='report'){target=result;field='summary';}
  else{const [group,name]=edit.target.split('.');target=({dimension:result.dimensions,finding:result.findings,service:result.serviceRecommendations}[group]||[]).find(x=>x.id===edit.id);field=name;}
  if(!target||!Object.hasOwn(target,field))throw Error('Rapor düzenlemesinin hedefi geçersiz.');
  if((edit.value.match(/\d+(?:[.,]\d+)*/g)||[]).some(n=>!allowedNumbers.has(n)))throw Error('Üslup düzenlemesi yeni sayı ekleyemez.');
  target[field]=edit.value;
  if(edit.target==='finding.statement')target.reportExcerpt=edit.value;
 }
 assertSchema(result,reportSchema);return result;
}
