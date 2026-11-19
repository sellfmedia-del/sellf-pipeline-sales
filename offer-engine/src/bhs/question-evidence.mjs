import {arr,obj,str} from './sequential-contracts.mjs';

// Meaning is assessed by the existing controller/worker, not by keyword rules.
// A receipt remains in the archive even when it does not answer its question.
export const questionPlanningInstruction='Sorguda işletmenin neyi aldığı/sattığı, kimin karar verdiği ve istenen ölçüm açık olsun. Müşterinin işini yönetecek partner ihtiyacını başka ajansların listesine çevirme; sağlayıcı kıyası açıkça istenmişse araştır. Markanın somut ürün/hizmet alt grubunu, alıcısını, pazarını, dönemini ve ölçümünü query ile expected içinde koru. Üst sektörün veya komşu ürün grubunun büyüklüğünü bu alt pazarın büyüklüğü yerine isteme. Örneğin ekipman alımını araştırırken şirketin devralınmasını anlatan sonuçları isteme. Sabit anahtar kelime veya hariç tutma listesi uygulama; ayırt edici terimleri bağlama göre sen seç.';
export const briefDecisionCoverageInstruction='Planın briefteki kararları gerçekten destekleyip desteklemediğini değerlendir. Hedefle mevcut durum arasındaki fark için hangi ürün, fiyat, rakip alternatifleri, satış kanalı, müşteri deneyimi veya dijital satış yolu bilgisinin kararı değiştireceğini sen seç. Bunlar zorunlu başlıklar veya görev kotası değildir. Mevcut bilgi yeterliyse yeniden araştırma isteme. Önemli bir karar sorusu eksikse bunu önceliklendir; başka sonuca bağlı ayrıntıyı o sonuç gelince belirle. Marka ve briefi kavramak için pazar büyüklüğünün doğrulanmasını bekleme; genel değerlendirmeyi kendi muhakemenle yap. Planladığın açık ihtiyaç için bütçeye sığan çağrı varsa araştırmayı sürdür. Araştırma kapandığında eksik bilgiyle de rapor yazılabilir; olgusal bulguyu kaynağına bağla.';
export const questionEvidenceInstruction='Her işte önce target, metric, expected ve query ile sorulan ilişkiyi anla: kim, neyi, hangi amaçla yapıyor ve hangi bilgi isteniyor? Aynı kelimeler veya üst sektör aynı sorunun yanıtı değildir. Örneğin bir işletmenin ekipman satın alması ile o işletmenin şirket olarak satın alınması farklı işlemlerdir; ürün/hizmet alt pazarı üst sektörle, distribütörlük iş ilanıyla, gönderi etkileşimi takipçi sayısıyla karıştırılmamalı. Ürün sınıfı, alıcı, pazar, dönem ve ölçüm kapsamını koru. Yakın kapsamlı veriyi istenen ölçüm yerine koyma; sınırı belirtip aynı soruyu daralt veya uygun kaynağı seç. proofs içine yalnız bu soruyu destekleyen pasajları seç. answerFit.status direct ise kanıt sorulan ilişkiyi doğrudan yanıtlar; partial ise yalnız ilgili kısmını yanıtlar ve sufficient false kalır; unrelated ise farklı ilişkiyi anlatır, proofs boş ve sufficient false olur. answerFit.reason içinde ayrımı açıkla. Doğrudan kaynaklı olumsuz yanıt da direct olabilir. İlgisiz kaynak marka hakkında olumsuz bulgu değildir. İlgili kısmi kanıtı koru; sıradaki sorguyu aynı sorunun öznesini, eylemini ve nesnesini açıklaştırarak daralt. Ham kaynakları silme ve genel araştırmaya dönme.';

const answerFitSchema=obj({status:{type:'string',enum:['direct','partial','unrelated']},reason:{...str(180),minLength:1}});
export function withQuestionEvidence(schema){
 const rows=schema.properties.decisions;
 return obj({...schema.properties,decisions:arr(obj({...rows.items.properties,answerFit:answerFitSchema}),rows.maxItems)});
}

export function questionEvidenceDecision(decision,assessment){
 const valid=assessment&&['direct','partial','unrelated'].includes(assessment.status)&&
  typeof assessment.reason==='string'&&assessment.reason.trim().length>0&&assessment.reason.length<=180;
 const answerFit=valid?{status:assessment.status,reason:assessment.reason.trim()}:
  {status:'unreviewed',reason:'Soruyla anlam eşleşmesi doğrulanmadı.'};
 const {read,...rest}=decision;
 const related=valid&&answerFit.status!=='unrelated';
 return {...rest,sufficient:decision.sufficient===true&&answerFit.status==='direct',
  proofs:related?decision.proofs:[],...(related&&read?{read}:{}),answerFit};
}
