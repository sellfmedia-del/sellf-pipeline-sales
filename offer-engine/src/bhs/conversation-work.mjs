import {qualifiedResearchSources} from './conversation-progress.mjs';

export const researchWorkPolicyVersion='targeted-research-review-v3';
const string={type:'string'},strings={type:'array',items:string};
const properties={path:string,text:string,access:{type:'string',enum:['public','client','analysis']},
 status:{type:'string',enum:['open','answered','unavailable']},questionId:string,issueId:string,sourceIds:strings,reason:string};
export const workReviewSchema={type:'object',properties:{rationale:string,items:{type:'array',items:{type:'object',properties,
 required:Object.keys(properties),additionalProperties:false}}},required:['rationale','items'],additionalProperties:false};
export const researchWorkGuidance='BHS İŞİNİ SONRAYA BIRAKMA: Rapor, aksiyon, görüşme sorusu veya sınırlama içinde şimdi BHS kapsamında araştırılabilecek önemli kamu işini müşteriye veya sonraki çalışmaya devretme. İlgili ürün/rakip/kanal sayfasını okumak, kamu satış koşulunu anlamak veya gerekli dar yorum örneğini incelemek BHS araştırmasıdır; gerçek uygulama/pilot, hesap içi veri ve ticari karar müşterinin sonraki işi olabilir. Ayrımı anlam bakımından sen yap; kelime/başlık sayısı veya her markaya aynı görev listesi kullanma. workReview.rationale bu ayrımı nasıl yaptığını anlatsın; items yalnız raporda gerçekten sonraya bırakılmış seçtiğin işi path/text ile bağlasın, zaten tamamlanmış analizi veya bütün raporu yeniden listeleme. public/open iş için ilgili issueId altında dar public soru ve research_needed kararı ver; önce ücretsiz arşivi ve önceki soruları kullan. Kamu işini client diye etiketleme. public/answered ancak mevcut answered public questionId ve okunmuş ilgili sourceIds ile, rapordaki eski görev de hedefli yamayla gerçek sonuca çevrildiyse kullanılabilir. unavailable gerçek erişim denemesi ve gerekçesiyle mevcut public soruya bağlansın; sınırı açıkla, tamamlandı sayma. İç ciro/marj/hesap bilgisi client; genel yorum analysis olarak kalsın, gereksiz dış araştırma başlatma. Gerçek bütçe/süre sınırında aynı tam raporu ve açık işleri dürüstçe koru. Dört öne çıkan bulgu yalnız özettir; bütün pazar, ürün/rakip, SWOT ve ticari gerekçeleri tam raporda koru. Yeni kanıtla aynı konuşmadaki iyi raporun yalnız etkilenen yerini düzelt.';
const text=value=>typeof value==='string'&&Boolean(value.trim());
const normalize=value=>value.replace(/\s+/gu,' ').trim();

// The analyst selects and classifies the real deferred work. These checks
// route that decision; they do not infer meaning from words in the narrative.
export function validateWorkReview(review,{draft,issues,pending,patched,progress,sources,readTarget,fail}){
 if(!text(review?.rationale))fail('Sonraya bırakılan işin BHS, müşteri veya uygulama kapsamını değerlendir.','research');
 const qualified=new Set(qualifiedResearchSources(progress,sources).map(row=>row.sourceId));
 for(const row of review.items){
  const detail={path:row.path,issueId:row.issueId};
  const target=readTarget(draft,row.path);
  if(typeof target.value!=='string'||!text(row.text)||!normalize(target.value).includes(normalize(row.text))||!text(row.reason))fail('İşi taslaktaki gerçek metne ve kapsam gerekçesine bağla.','research',detail);
  const issue=row.issueId?issues.get(row.issueId):null;
  if(row.issueId&&!issue)fail('İşin bağlı olduğu sorun bulunmuyor.','research',detail);
  if(row.sourceIds.some(id=>!qualified.has(id)))fail('İş sonucu yalnız okunmuş ve ilgili bulunmuş kaynağa bağlanabilir.','research',detail);
  if(row.access!=='public'){
   if(issue?.access==='public'&&pending.some(item=>item.id===issue.id))fail('Açık kamu işini müşteri veya genel analiz işi olarak teslim etme.','research',detail);
   if(row.access==='analysis'&&row.status!=='answered')fail('Genel değerlendirmeyi aynı raporda tamamla; kaynak görevi olarak sonraya bırakma.','research',detail);
   continue;
  }
  if(row.status==='open'){
   const existing=progress?.questions?.find(q=>q.id===row.questionId&&q.access==='public');
   if(existing&&existing.status!=='open')fail('Bu kamu sorusunun mevcut sonucunu ve ücretsiz arşivini kullan; cevaplanmış veya erişim sınırı kaydedilmiş işi yeniden sıraya koyma.','research',detail);
   if(!issue||issue.access!=='public'||!text(issue.question)||!pending.some(item=>item.id===issue.id))fail('Açık BHS kamu işi için gerçek dar public soru ve research_needed kararı gerekli.','research',detail);
  }else{
   const question=progress?.questions?.find(q=>q.id===row.questionId&&q.access==='public'&&q.status===row.status);
   if(!question)fail('Kamu işinin sonucu aynı konuşmadaki gerçek araştırma sorusuna bağlı olmalı.','research',detail);
   if(row.status==='answered'&&(!row.sourceIds.length||row.sourceIds.some(id=>!question.sourceIds.includes(id))||!patched.has(row.issueId)))
    fail('Okunan sonucu mevcut public soruya bağla ve sonraya bırakılan görevi hedefli yamayla gerçek analiz sonucuna çevir.','research',detail);
   if(row.status==='unavailable'&&!text(question.rationale))fail('Erişim sınırının gerçek gerekçesini koru.','research',detail);
  }
 }
}
