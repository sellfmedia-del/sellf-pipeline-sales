import {BudgetError} from '../budget/ledger.mjs';
import {canonicalConversationHash} from './conversation-context.mjs';

export const modelInputVersion='business-brief-private-input-v1';
const marker='⟦çıkarıldı⟧';
export const crmContextGuidance='GÖRÜŞME BAĞLAMI: Briefteki marka, hedef, ihtiyaç, mevcut partnerler, hizmet kapsamı ve ticari görüşme içeriğini birlikte koru. Bizim satış takibimizde adaya ulaşamamamız, toplantının ertelenmesi veya teklif takibi markanın karar alma, operasyon, müşteri hizmeti ya da büyüme kusuru değildir. Notta özne belirsizse olumsuz marka sonucu üretme; gerçekten markanın müşterileriyle yaşadığı doğrulanmış sorunu ise sırf iletişim konusu diye dışlama. Erişim/iletişim bilgisi çıkarılması marka riski veya eksikliği değildir. Bu temizlik hizmet seçimini, müşteri hedefini ve mevcut iş ortaklarını değiştirmez.';
const fail=()=>{throw new BudgetError('input_privacy','Model bağlamında güvenle aktarılamayan erişim bilgisi var; yeni sağlayıcı çağrısı başlatılmadı.');};
const secretKey=/^(?:password|passwd|pwd|passphrase|şifre(?:si)?|sifre(?:si)?|parola|token|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|private[_ -]?key|session[_ -]?token|[A-Z][A-Z0-9_]*_(?:API_KEY|PASSWORD|SECRET|TOKEN|PRIVATE_KEY)|DATABASE_URL)$/iu;
const innocuous=/^(?:sıfırlama|sifirlama|reset|resetleme|belirleme|oluşturma|olusturma|yönetimi|yonetimi|korumalı|korumali|gerekiyor|gerekli|istiyor|ile|olmadan)$/iu;
const unquote=value=>value.replace(/^["'`]|["'`]$/gu,'');

// Only a model-facing copy is changed. Original CRM/brief/source journals and
// evidence text are never rewritten by these routines.
export function redactInputText(input,{contacts=true}={}){
 let text=String(input??''),redactions=0;const privateValues=[];
 const hide=value=>{if(value===marker)return value;redactions++;privateValues.push(unquote(value));return marker;};
 text=text.replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/gu,hide);
 text=text.replace(/(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s<>"'`]+/giu,value=>{
  const candidate=value.replace(/[),;.!?]+$/u,'');
  try{const url=new URL(candidate),privateQuery=[...url.searchParams.keys()].some(key=>/token|secret|password|api.?key|authorization|signature|credential|session|^sig$|^_vercel_share$|^(?:email|phone|mobile|contact_email|contact_phone)$/iu.test(key));
   if(url.username||url.password||privateQuery||/\/(?:reset-password|magic-link|auth\/callback)\/[^/?#]+/iu.test(url.pathname))return hide(candidate)+value.slice(candidate.length);
  }catch{/* Retain ordinary business text that is not a URL. */}
  return value;
 });
 const label='(?:password|passwd|pwd|passphrase|şifre(?:si|miz)?|sifre(?:si|miz)?|parola|token|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|authorization|[A-Z][A-Z0-9_]*_(?:API_KEY|PASSWORD|SECRET|TOKEN|PRIVATE_KEY)|DATABASE_URL)';
 const value='(?:"[^"\\n]+"|\'[^\'\\n]+\'|`[^`\\n]+`|[^\\s,;]+)';
 text=text.replace(new RegExp('(?<![\\p{L}\\p{N}_])('+label+')(["\']?[ \\t]*[:=][ \\t]*)('+value+')','giu'),(all,key,separator,raw)=>{
  if(unquote(raw)===marker)return all;
  return key+separator+hide(raw);
 });
 text=text.replace(new RegExp('(?<![\\p{L}\\p{N}_])(şifre(?:si|miz)?|sifre(?:si|miz)?|parola|password)([ \\t]+)('+value+')','giu'),(all,key,space,raw)=>{
  const explicit=/^["'`]/u.test(raw)||/(?:si|miz)$/iu.test(key)||/\d/u.test(raw);
  return !explicit||innocuous.test(raw)||unquote(raw)===marker?all:key+space+hide(raw);
 });
 text=text.replace(/\bBearer[ \t]+[A-Za-z0-9._~+\/-]{8,}/giu,hide);
 text=text.replace(/\b(?:sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{15,}|xox[baprs]-[A-Za-z0-9-]{15,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,})\b/gu,hide);
 if(contacts){
  text=text.replace(/\b[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,hide);
  text=text.replace(/\b(tel(?:efon)?|gsm|mobile|phone|whats[ -]?app)([ \t]*[:=][ \t]*)(\+?[\d(][\d .()-]{7,}\d)/giu,
   (all,key,separator,number)=>number.replace(/\D/gu,'').length<=15?key+separator+hide(number):all);
  text=text.replace(/\+(?:\d[ .()-]*){8,14}\d\b(?![ \t]*(?:TL|TRY|USD|EUR|₺|%))/gu,number=>hide(number));
  text=text.replace(/\b0[ .(-]*5\d{2}[ .()-]*\d{3}[ .()-]*\d{2}[ .()-]*\d{2}\b/gu,(number,offset,whole)=>
   /\b(?:sku|ean|gtin|id|kod[u]?)[ :]*$/iu.test(whole.slice(Math.max(0,offset-20),offset))?number:hide(number));
 }
 return {text,redactions,privateValues};
}
const fold=value=>String(value).toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replaceAll('ı','i').trim();
function crmOnly(sentence,typed){
 const value=fold(sentence).replace(/[.!?;]+$/u,'').trim();
 const subject='(?:(?:biz|ben)\\s+)?(?:(?:ilgili kisiye|kendisine|kendisiyle|yetkiliye|musteri adayina|karar vericiye|markaya)\\s+)?';
 const outcome='(?:ulasamadik|ulasamadim|gorusemedik|gorusemedim|aradik|arayacagiz|tekrar arayacagiz|ulasilamadi|donus alinamadi|telefon acilmadi|telefonu acmadi|toplanti ertelendi|tekrar aranacak|yarin aranacak)';
 if(!new RegExp('^'+subject+outcome+'(?:[, ]+(?:tekrar aranacak|yarin aranacak|haftaya aranacak|tekrar arayacagiz))*$','u').test(value))return false;
 return typed||/^(?:biz\s|ben\s|ilgili kisiye\s|kendisine\s|kendisiyle\s|yetkiliye\s|musteri adayina\s|karar vericiye\s|markaya\s)|ulasamadik|ulasamadim|gorusemedik|gorusemedim|aradik|arayacagiz/u.test(value);
}
export function businessMeetingNotes(notes){
 let excluded=0;
 const lines=String(notes||'').split('\n').map(line=>{
  const prefix=line.match(/^\s*(?:(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|\d{1,2}\s+\p{L}+\s+\d{4})\s*·\s*)?(?:arama|telefon|takip|follow[- ]?up|call|e[- ]?posta|mail|whatsapp|toplantı|meeting|görüşme|teklif|teklif takibi|satış takibi)\s*[·:]\s*/iu)?.[0]||'';
  const body=prefix?line.slice(prefix.length):line;
  const parts=body.split(/(?<=[.!?;])\s+/u),kept=[];
  for(const sentence of parts){if(crmOnly(sentence,Boolean(prefix))){excluded++;continue;}kept.push(sentence);}
  const retained=kept.join(' ').trim();return retained?(prefix+retained):'';
 });
 return {text:lines.join('\n').replace(/\n{3,}/gu,'\n\n').trim(),excluded};
}
export function projectModelBrief(original){
 const brief={},privateValues=[];let redactions=0,crmExcluded=0;
 for(const key of ['brandName','segment','website','goals','needs','services','meetingNotes','budget']){
  if(!Object.hasOwn(original,key))continue;
  const value=original[key];
  if(typeof value!=='string'){brief[key]=value;continue;}
  const clean=redactInputText(value);redactions+=clean.redactions;privateValues.push(...clean.privateValues);
  if(key==='website'&&clean.text!==value)fail();
  if(key==='meetingNotes'){const business=businessMeetingNotes(clean.text);brief[key]=business.text;crmExcluded+=business.excluded;}
  else brief[key]=clean.text;
 }
 return {brief,privateValues,boundary:{version:modelInputVersion,redactions,crmExcluded}};
}
function embeddedBrief(text,privateValues){
 let at=text.indexOf('{');if(at<0)return protectModelValue(text,{privateValues});let depth=0,quoted=false,escaped=false;
 for(let index=at;index<text.length;index++){
  const char=text[index];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}if(char==='{')depth++;if(char==='}'&&!--depth){
   let value;try{value=JSON.parse(text.slice(at,index+1));}catch{return protectModelValue(text,{privateValues});}
   if(value&&typeof value.brandName==='string'&&typeof value.website==='string'&&Object.hasOwn(value,'meetingNotes')){
    const projection=projectModelBrief(value);privateValues.push(...projection.privateValues);value=projection.brief;
   }else if(value?.brief&&typeof value.brief.brandName==='string'&&Object.hasOwn(value.brief,'meetingNotes')){
    const projection=projectModelBrief(value.brief);privateValues.push(...projection.privateValues);value={...value,brief:projection.brief};
   }
   return protectModelValue(text.slice(0,at),{privateValues})+JSON.stringify(protectModelValue(value,{privateValues}))+protectModelValue(text.slice(index+1),{privateValues});
  }
 }return protectModelValue(text,{privateValues});
}
const hasPrivateValue=(text,values)=>values.some(value=>value.length>=8&&text.includes(value));
export function assertCredentialFree(value){if(redactInputText(typeof value==='string'?value:JSON.stringify(value),{contacts:false}).redactions)fail();}
export function protectModelValue(value,{contacts=true,privateValues=[]}={}){
 if(typeof value==='string'){
  let text=redactInputText(value,{contacts}).text;
  for(const secret of privateValues)if(secret.length>=8)text=text.replaceAll(secret,marker);
  return text;
 }
 if(Array.isArray(value))return value.map(item=>protectModelValue(item,{contacts,privateValues}));
 if(!value||typeof value!=='object')return value;
 if(['user','assistant'].includes(value.role)&&(typeof value.content==='string'||Array.isArray(value.content)))
  return protectConversationMessages([value],{privateValues})[0];
 if(value.type==='thinking'){
  assertCredentialFree(value.thinking||'');if(hasPrivateValue(value.thinking||'',privateValues))fail();return structuredClone(value);
 }
 if(value.type==='redacted_thinking')return structuredClone(value);
 // Real body views/quotes cannot be rewritten without invalidating their
 // original passage proof. Block unsafe credentials before dispatch instead.
 if(typeof value.sourceId==='string'&&typeof value.quote==='string'||typeof value.url==='string'&&typeof value.text==='string'){
  assertCredentialFree(value);return structuredClone(value);
 }
 if(typeof value.brandName==='string'&&typeof value.website==='string'&&Object.hasOwn(value,'meetingNotes'))return projectModelBrief(value).brief;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,secretKey.test(key)?marker:protectModelValue(item,{contacts,privateValues})]));
}
export function protectConversationMessages(messages,{privateValues=[]}={}){
 const values=[...privateValues];
 return messages.map(message=>({...message,content:typeof message.content==='string'?embeddedBrief(message.content,values):
  message.content.map(block=>{
   if(block.type==='tool_result'&&typeof block.content==='string'){
    let parsed;try{parsed=JSON.parse(block.content);}catch{return {...block,content:protectModelValue(block.content,{privateValues:values})};}
    return {...block,content:JSON.stringify(protectModelValue(parsed,{privateValues:values}))};
   }
   if(block.type==='text')return {...block,text:embeddedBrief(block.text,values)};
   return protectModelValue(block,{privateValues:values});
  })}));
}
export async function ensureModelInputContext({brief,ledger,id}){
 const projection=projectModelBrief(brief),expected={version:modelInputVersion,originalBriefDigest:canonicalConversationHash(brief),
  modelBrief:projection.brief,modelBriefDigest:canonicalConversationHash(projection.brief),boundary:projection.boundary};
 let key='audit:conversation:model-input:'+id+':'+modelInputVersion,saved=await ledger.get(key);
 if(saved&&saved.state!=='complete'&&saved.charge_kurus===0){key+=':recovered';saved=await ledger.get(key);}
 const context=saved?.state==='complete'?saved.value:await ledger.once(key,{version:modelInputVersion,originalBriefDigest:expected.originalBriefDigest},0,async()=>expected);
 if(canonicalConversationHash(context)!==canonicalConversationHash(expected))fail();return context;
}
