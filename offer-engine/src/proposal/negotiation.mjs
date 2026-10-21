import {digest} from '../pricing/proof.mjs';
import {assertQuote,usdAmount} from '../pricing/currency.mjs';
const ids=['growth_operations','operations_bundle'];
export function monetaryAmount(value){
 if(typeof value!=='number'&&typeof value!=='string')throw Error('Fiyat geçersiz.');
 const text=String(value).trim();if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(text))throw Error('Fiyatı pozitif ve en fazla iki ondalık basamakla gir.');
 const number=Number(text);if(!Number.isFinite(number)||number<=0||number>1e10)throw Error('Fiyat sıfırdan büyük olmalı.');return Math.round(number*100)/100;
}
export function priceTerms(row){
 const doc=row.customer_document,pricing=row.pricing_snapshot;assertQuote(doc,{requireReady:true});
 if(!pricing?.alternatives||ids.some(id=>!pricing.alternatives.some(a=>a.id===id)))throw Error('Kaydedilen fiyat dayanağı bulunamadı.');
 const currency=doc.quote?.currency||'TRY',rate=doc.quote?.exchangeRate?.rate;
 const display=value=>currency==='USD'?usdAmount(value,rate):value;
 return {currency,documentHash:digest(doc),...(rate?{exchangeRate:doc.quote.exchangeRate}:{}),alternatives:ids.map(id=>{
  const base=pricing.alternatives.find(a=>a.id===id),current=doc.alternatives.find(a=>a.id===id);
  return {id,name:current.name,current:currency==='USD'?doc.quote.alternatives.find(a=>a.id===id).monthlyAmount:current.monthlyAmount,recommended:display(base.monthlyAmount),minimum:display(base.minimumAmount),cost:display(base.cost)};
 })};
}
export function negotiatedDocument(row,amounts,{confirmedBelowMinimum=false}={}){
 const terms=priceTerms(row);if(!amounts||Object.keys(amounts).sort().join(',')!==[...ids].sort().join(','))throw Error('İki alternatifin fiyatını gir.');
 const input=Object.fromEntries(ids.map(id=>[id,monetaryAmount(amounts[id])])),below=terms.alternatives.filter(a=>input[a.id]<a.minimum);
 if(below.length&&!confirmedBelowMinimum)throw Error('Önerilen kârlılık tabanının altındaki fiyatı ayrıca onayla.');
 const doc=structuredClone(row.customer_document),rate=doc.quote?.exchangeRate?.rate;
 for(const a of doc.alternatives){
  const amount=input[a.id];
  // Floor the internal TRY equivalent so ceil-cent USD rendering reproduces
  // the exact negotiated USD amount, without refreshing the frozen FX record.
  a.monthlyAmount=terms.currency==='USD'?Number(BigInt(Math.round(amount*100))*BigInt(Math.round(rate*1e6))/1000000n)/100:amount;
 }
 if(terms.currency==='USD')doc.quote.alternatives.forEach(a=>{a.monthlyAmount=input[a.id];});
 if(doc.valueSync)doc.valueSync.amount=doc.alternatives.find(a=>a.id===doc.recommendedAlternativeId).monthlyAmount;
 assertQuote(doc,{requireReady:true});
 return {document:doc,input,belowMinimum:below.map(a=>a.id),terms};
}
