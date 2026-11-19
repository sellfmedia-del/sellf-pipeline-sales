// These are presentation/consent controls, not research subjects or a search
// exclusion list. Keep the original page/receipt; clean only its research view.
const fold=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replaceAll('ı','i');
const buttons=/^(?:(?:accept|reject|allow)(?: all| optional| necessary)?(?: cookies)?|manage (?:cookie )?(?:preferences|consent)|cookie (?:settings|preferences)|save (?:my )?preferences|(?:tumunu|tum cerezleri) (?:kabul et|reddet)|cerez (?:ayarlari|tercihleri)|tercihleri (?:yonet|kaydet)|tout accepter|tout refuser|gerer les (?:cookies|preferences))[.!\s]*$/u;
const consentSentence=/^(?:we (?:and our partners )?use cookies\b|this (?:website|site) uses cookies\b|bu (?:web )?sitesi[^.!?]{0,80}cerez|sitemizde[^.!?]{0,60}cerez|nous utilisons des cookies\b)/u;
const consentBlock=/(?:^|[\s_-])(?:onetrust-banner-sdk|onetrust-consent-sdk|onetrust-pc-sdk|cybotcookiebotdialog|cookie[-_]?(?:consent|banner|notice)|cookies[-_]banner|consent[-_]banner|cky-consent(?:-container)?|cc-window|qc-cmp2-container)(?:$|[\s_-])/iu;
const voidTag=/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
const sentences=new Intl.Segmenter('en',{granularity:'sentence'});
const browserContext=/\b(?:experience|website|site|browser|device|analytics|personalis\p{L}*|personaliz\p{L}*|advert\p{L}*|trafik|cihaz\p{L}*|taray\p{L}*|deneyim\p{L}*|sitemiz\p{L}*|reklam\p{L}*|navigation|traceurs?)\b/u;

export function consentEvidenceRequested(value){
 const text=fold(Array.isArray(value)?value.join(' '):typeof value==='object'&&value?
  [value.metric||value.name,value.expected,value.target,value.query].filter(Boolean).join(' '):value);
 return /\b(?:gdpr|kvkk|cmp)\b/u.test(text)||/\b(?:cookies?|cerez)\b/u.test(text)&&
  /\b(?:consent|banner|settings|preferences|policy|politika\p{L}*|izin|izni|riza\p{L}*)\b/u.test(text);
}

export function stripConsentUi(html){
 const tags=/<\/?([a-z][\w:-]*)\b[^>]*>/giu;
 const spans=[];let open;
 for(const token of html.matchAll(tags)){
  const closing=token[0].startsWith('</'),name=token[1].toLowerCase();
  if(open){
   if(name!==open.name)continue;
   if(closing)open.depth--;else if(!voidTag.test(name)&&!token[0].endsWith('/>'))open.depth++;
   if(!open.depth){spans.push([open.start,token.index+token[0].length]);open=undefined;}
   continue;
  }
  if(closing)continue;
  const attributes=[...token[0].matchAll(/\b(?:id|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)].map(m=>m[1]??m[2]??m[3]).join(' ');
  if(!consentBlock.test(attributes))continue;
  if(voidTag.test(name)||token[0].endsWith('/>'))spans.push([token.index,token.index+token[0].length]);
  else open={name,start:token.index,depth:1};
 }
 // An unclosed widget must never swallow the product/article that follows it.
 let output='',at=0;
 for(const [start,end] of spans){output+=html.slice(at,start)+' ';at=end;}
 return output+html.slice(at);
}

export function cleanEvidenceText(value,{preserveConsent=false}={}){
 const text=typeof value==='string'?value:'';
 if(preserveConsent)return text.trim();
 return text.split(/\r?\n/u).flatMap(line=>{
  const trimmed=line.trim();
  if(!trimmed||buttons.test(fold(trimmed)))return [];
  // Sentence boundaries prevent a consent notice from consuming a following
  // product fact on the same line. Product names/tables need no full stop.
  const parts=[...sentences.segment(trimmed)].map(row=>row.segment);
  const kept=parts.filter(part=>{
   const folded=fold(part.trim());
   return !(consentSentence.test(folded)&&browserContext.test(folded))&&!buttons.test(folded)&&
    !/^(?:we value your privacy|your privacy is important to us|privacy preferences|gizliliginize onem veriyoruz)[.!\s]*$/u.test(folded);
  });
  return kept.length?[kept.join('').trim()]:[];
 }).join('\n');
}

export const substantiveEvidence=(value,options)=>cleanEvidenceText(value,options).replace(/\s+/gu,' ').trim().length>0;

export function researchGapStatement(value,{sources=[]}={}){
 const text=fold(value);
 const gap=/\b(?:dogrulanamadi\p{L}*|teyit edilemedi\p{L}*|could not (?:be )?(?:verified|confirmed|found)|cannot (?:be )?(?:verified|confirmed)|not (?:yet )?verified|insufficient (?:data|evidence)|no (?:verified |direct |purchase |purchasing )?evidence (?:was |is )?(?:found|available)|no verified (?:purchase|buyer|sales) evidence)\b/u.test(text)||
  /\b(?:kanit\p{L}*|veri\p{L}*)\s+(?:(?:bulun|saptan)(?:amadi|madi)|bulunmuyor|tespit edilemedi|yok(?:tur)?|mevcut degil)\b/u.test(text)||
  /\bno (?:verified |direct |purchase |purchasing )?evidence\b[^.!?]{0,100}\b(?:found|available|exists)\b/u.test(text)||
  /\b(?:bu arastirmada|incelenen kaynaklarda|available sources|examined sources)\b[^.!?]{0,140}\b(?:bulunamadi|ulasila?madi|eksik|not found|not available)\b/u.test(text);
 if(!gap)return false;
 // A quoted regulator/auditor's negative conclusion can itself be important
 // evidence. Do not confuse it with our own inability to complete a search.
 const attributed=/\b(?:bildirdi|bildiriyor|belirtti|belirtiyor|raporladi|raporluyor|reported|reports|concluded|concludes|stated|states)\b/u.test(text);
 return !(attributed&&sources.some(source=>['html','pdf','rendered','extracted'].includes(source.method||source.verification?.method)&&
  researchGapStatement(source.quote)));
}

export function researchGapQuestion(row,needs){
 const rawIds=row.needIds??row.researchNeedIds;
 const ids=Array.isArray(rawIds)?rawIds:[];
 const need=ids.map(id=>needs?.get(id)).find(Boolean);
 if(!need&&!researchGapStatement(row?.observation??row?.statement))return;
 const name=need?.metric||need?.name;
 const statement=row?.observation??row?.statement??'';
 // These are existing application status notes, not an unidentified business
 // problem. Removing them from highlights must not create filler questions.
 if(!name&&/^(?:Bazı iddialar doğrulanamadı; korunan bulgular üzerinden görüşmede tamamlanacak\.|Bu araştırmada veri bulunamadı; görüşmede doğrulanacak\.)$/u.test(statement))return;
 // Reuse an explicitly open question; otherwise ask neutrally about the
 // information need, rather than repeat an unsupported negative diagnosis.
 const question=row.question||row.decisionQuestion||(!name?row.goalConnection:undefined);
 if(typeof question==='string'&&question.trim().endsWith('?')&&!researchGapStatement(question))return question.trim();
 return name?'“'+name.replace(/[.!?]+$/u,'')+'” hangi kaynak, dönem veya kayıtlarla doğrulanabilir?':
  'Bu değerlendirmeyi doğrulamak için hangi güncel kaynak veya iç kayıt incelenebilir?';
}

export const evidenceQualityInstruction='Çerez bildirimi, onay düğmeleri, gezinme menüsü ve kopuk sayfa başlıkları marka veya pazar kanıtı değildir. Bunları bir araştırma ihtiyacını karşılayan kanıt olarak seçme. Yalnız çerez/izin işleyişi özellikle sorulmuşsa o arayüzü, gözlenen işlevi aşmadan değerlendir. Kaynağın açıkça bildirdiği olumsuz koşul ile bu araştırmada bilgiye ulaşılamamasını ayır. “Doğrulanamadı”, “satın alma kanıtı yok” veya “veri bulunamadı” araştırma durumudur; marka hakkında doğrulanmış eksiklik değildir. Bu ifadeleri bulguya veya SWOT zayıflığına dönüştürme; ihtiyacı açık tut. Yalnız çıktı sözleşmesinde soru alanı varsa tarafsız bir doğrulama sorusu yaz; sözleşme dışı alan ekleme.';
