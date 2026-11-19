import {arr,obj,str} from './sequential-contracts.mjs';

// Meaning is assessed by the existing controller/worker, not by keyword rules.
// A receipt remains in the archive even when it does not answer its question.
export const questionPlanningInstruction='Sorguyu yalnız sektör adı ve genel bir fiille kurma. İşletmenin neyi aldığı/sattığı, kimin karar verdiği ve hangi ölçümün istendiği açık olsun. Örneğin ekipman alımını araştırırken şirketin devralınmasını anlatan sonuçları isteme. Ayırt edici ürün veya işlem terimlerini sorguda ve expected içinde koru. Sabit anahtar kelime veya hariç tutma listesi uygulama; doğru terimleri bu markanın ve briefin bağlamına göre kendin seç.';
export const questionEvidenceInstruction='Her işte önce target, metric, expected ve query ile sorulan ilişkiyi anla: kim, neyi, hangi amaçla yapıyor ve hangi bilgi isteniyor? Kaynağın aynı kelimeleri kullanması yeterli değildir. Örneğin bir işletmenin ekipman satın alması ile o işletmenin şirket olarak satın alınması farklı işlemlerdir; ilaç satışı ile şirket hisselerinin satışı, distribütörlük ile iş ilanı, gönderi etkileşimi ile takipçi sayısı da farklı sorulardır. proofs içine yalnız bu soruyu gerçekten destekleyen pasajları seç. answerFit.status direct ise seçtiğin kanıtlar sorulan ilişkiyi doğrudan yanıtlar; partial ise yalnız ilgili bir kısmını yanıtlar ve sufficient false kalır; unrelated ise farklı bir ilişkiyi anlatır, proofs boş ve sufficient false olur. answerFit.reason içinde bu ayrımı kısaca açıkla. Doğrudan kaynaklı olumsuz bir yanıt da direct olabilir. İlgisiz kaynağın bulunması marka hakkında olumsuz bulgu değildir. İlgili ama yetersiz kanıtı koru; sıradaki sorguyu aynı sorunun öznesini, eylemini ve nesnesini açıklaştırarak daralt. Ham kaynakları silme ve genel araştırmaya dönme.';

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
