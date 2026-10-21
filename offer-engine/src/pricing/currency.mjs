// Quote conversion is separate from canonical TRY costing and paid research.
export const rateSource='https://www.tcmb.gov.tr/kurlar/today.xml';
export function quoteCurrency(value){const currency=value??'TRY';if(!['TRY','USD'].includes(currency))throw Error('Teklif para birimi TL veya USD olmalı.');return currency;}
const day=86400000;
export function parseUsdTry(xml,now=Date.now()){
 if(typeof xml!=='string'||xml.length>150000)throw Error('Kur yanıtı geçersiz.');
 const date=xml.match(/\bTarih="(\d{2})\.(\d{2})\.(\d{4})"/),block=xml.match(/<Currency\b[^>]*(?:CurrencyCode|Kod)="USD"[^>]*>([\s\S]*?)<\/Currency>/)?.[1];
 const raw=block?.match(/<ForexSelling>\s*(\d+(?:\.\d{1,6})?)\s*<\/ForexSelling>/)?.[1],unit=block?.match(/<Unit>\s*(\d+)\s*<\/Unit>/)?.[1];
 const rate=Number(raw),published=date?Date.UTC(+date[3],+date[2]-1,+date[1]):NaN;
 if(!date||!Number.isFinite(published)||new Date(published).getUTCDate()!==+date[1]||published>now||now-published>7*day||unit!=='1'||!Number.isFinite(rate)||rate<=0||rate>10000)throw Error('Güncel dolar kuru doğrulanamadı.');
 return {provider:'TCMB',kind:'ForexSelling',base:'USD',quote:'TRY',rate,publishedAt:new Date(published).toISOString().slice(0,10),checkedAt:new Date(now).toISOString(),source:rateSource};
}
export function createUsdTryRate({fetchImpl=fetch,now=Date.now}={}){
 let cached,inFlight;
 return async()=>{
  const current=now();
  // Recheck across the daily publication window instead of reusing yesterday's rate.
  if(cached&&current-Date.parse(cached.checkedAt)<5*60000)return structuredClone(cached);
  if(!inFlight)inFlight=(async()=>{
   const response=await fetchImpl(rateSource,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/xml'}});
   if(!response.ok)throw Error('Kur kaynağına ulaşılamadı.');
   cached=parseUsdTry(await response.text(),now());return cached;
  })().finally(()=>{inFlight=null;});
  return structuredClone(await inFlight);
 };
}
export function usdAmount(amount,rate){
 if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(Math.round(amount*100))||!Number.isFinite(rate)||rate<=0||rate>10000)throw Error('Kur dönüşümü geçersiz.');
 const units=Math.round(rate*1e6);if(!units||Math.abs(rate-units/1e6)>1e-10)throw Error('Kur hassasiyeti geçersiz.');
 const cents=BigInt(Math.round(amount*100))*1000000n,divisor=BigInt(units);
 return Number((cents+divisor-1n)/divisor)/100;
}
export function addQuote(result,{currency='TRY',exchangeRate}={}){
 quoteCurrency(currency);if(currency==='TRY')return result;
 const data=structuredClone(result.data);
 data.quote=exchangeRate?{currency:'USD',status:'ready',exchangeRate:structuredClone(exchangeRate),rounding:'ceil_cent',alternatives:data.alternatives.map(a=>({id:a.id,monthlyAmount:usdAmount(a.monthlyAmount,exchangeRate.rate)}))}:{currency:'USD',status:'pending',notice:'Dolar kuru alınamadı; TL hesaplaması korundu. Araştırmayı tekrarlamadan fiyatı yeniden hesaplayabilirsin.'};
 return {...result,status:exchangeRate?result.status:'review',data};
}
export function assertQuote(data,{requireReady=false}={}){
 const q=data.quote;if(!q)return;
 if(q.currency!=='USD'||!['ready','pending'].includes(q.status))throw Error('Teklif para birimi kaydı geçersiz.');
 if(q.status==='pending'){if(requireReady||q.alternatives||q.exchangeRate)throw Error('Dolar tutarı için doğrulanmış kur gerekli.');return;}
 const fx=q.exchangeRate;
 if(fx?.provider!=='TCMB'||fx.kind!=='ForexSelling'||fx.base!=='USD'||fx.quote!=='TRY'||fx.source!==rateSource||!/^\d{4}-\d{2}-\d{2}$/.test(fx.publishedAt)||!Number.isFinite(Date.parse(fx.checkedAt))||q.rounding!=='ceil_cent'||q.alternatives?.length!==2)throw Error('Kur kaydı doğrulanamadı.');
 for(const [i,a]of data.alternatives.entries())if(q.alternatives[i]?.id!==a.id||q.alternatives[i].monthlyAmount!==usdAmount(a.monthlyAmount,fx.rate))throw Error('Dolar tutarı doğrulanmış TL hesabıyla eşleşmiyor.');
}
