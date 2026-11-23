import {BudgetError} from '../budget/ledger.mjs';
import {semanticReviewSchema} from './conversation-contract.mjs';

export const reviewPolicyVersion='targeted-claim-review-v2';
const string={type:'string'},strings={type:'array',items:string};
const properties={path:string,text:string,kind:{type:'string',enum:['source_fact','brief_statement','hypothesis','client_question']},
 basis:string,sourceIds:strings,briefQuote:string,verification:string,issueId:string};
export const claimReviewSchema={...semanticReviewSchema,properties:{...semanticReviewSchema.properties,claimScope:string,
 claimChecks:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}},
 required:[...semanticReviewSchema.required,'claimScope','claimChecks']};
export function checkedReviewPolicy(version){
 if(version!==undefined&&version!==reviewPolicyVersion)throw new BudgetError('budget_context','Korunmuş denetim sözleşmesi doğrulanamadı.');
 return version;
}
export function reviewToolsFor(tools,version){
 if(!checkedReviewPolicy(version))return tools;
 return tools.map(tool=>tool.name==='review_bhs'?{...tool,input_schema:claimReviewSchema,
  description:tool.description+' claimScope/claimChecks ile karar değiştiren iddiaların olgu, brief beyanı, hipotez veya müşteri sorusu olduğunu değerlendir. Düzeltilen sorunlarla hâlâ araştırılacak public sorunları ayrı tut; research_needed aynı kararda geçerli küçük yamaları da taşıyabilir.'}:tool);
}
export const claimReviewGuidance='İDDİA VE DÜZELTME DENETİMİ: Biçim/uygulanabilirlik hatasını, yanlış ticari iddiayı ve eksik public araştırmayı ayır. Yalnız sorunlu iddiayı küçük yamayla düzelt; güçlü raporu tekrar yazma. Aynı kararda düzeltilebilir iddialara patch verip hâlâ önemli public soru varsa research_needed kullanabilirsin. Müşteriden alınacak iç bilgi public araştırma değildir; gerekiyorsa raporu koşullu ifadeye düzelt ve müşteri sorusunu ekle. claimScope ile özet, rapor/SWOT, bulgu ve aksiyonlar arasındaki kesinlik tutarlılığını nasıl incelediğini anlat; claimChecks içinde senin seçtiğin karar değiştiren gerçek metinleri path/text ile bağla. Her cümleye ayrı kayıt veya sabit kontrol kotası üretme. kind: source_fact yalnız okunmuş ilgili kaynağın gerçekten desteklediği olgu; brief_statement müşterinin beyanı (briefQuote gerçek brief pasajı); hypothesis koşullu ticari çıkarım (basis ve nasıl doğrulanacağı verification); client_question müşteriden gerekli iç bilgi. Kaynağın bir cümleyi içermesi bütün ticari sonucu kanıtlamaz. Brifte süreç/deneyim verisi belirtilmemesi zayıflık kanıtı değildir. Profesyonellere satış kuralı fiyat gücü, kanal kontrolü, marj veya düzenleme uyumu kanıtı değildir. Bu sonuçlar ancak gerçekten destekleniyorsa olgu, aksi halde koşullu hipotez ve doğrulama sorusudur. Aynı ayrımı SWOT, özet, bulgu ve aksiyonda koru. Kaynak sayısı/başlık/anahtar kelime kalite ölçüsü değildir. Sorunlu claimCheck.issueId ilgili issue ile eşleşsin; korunan iddiada boş olsun. Ücretsiz eski kaynak/pasajı yeniden kullan; araştırma dönüşü aynı taslağın yalnız etkilenen kısmını düzelt. Teknik hatada geri bildirilen path/issueId ve neden üzerinden uygulanabilir yamayı düzelt; aynı başarısız yanıtı veya bütün raporu yeniden üretme.';
