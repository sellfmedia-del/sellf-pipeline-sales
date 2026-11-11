import {BudgetError,tariff} from '../budget/ledger.mjs';

// Review is operational metadata. The USD rates, FX envelope and shared
// reservation ledger still bound every call made by this BHS engine.
const {expires:legacyExpiry,...reviewedRates}=tariff;
export const researchTariff=Object.freeze({...reviewedRates,version:'sellf-bhs-2026-11-11',reviewAt:'2026-12-11T00:00:00Z'});

const dayMs=86400000;
const dateKey=time=>new Date(time).toISOString().slice(0,10);
const validFx=(value,time)=>{
 const published=Date.parse(value?.publishedAt);
 return Number.isFinite(published)&&time-published<=7*dayMs&&published<=time+dayMs&&Number.isFinite(value.usdTry)&&value.usdTry>0&&value.usdTry<=researchTariff.usdTry;
};

export function createResearchFx({ledger,fetchImpl=fetch,now=Date.now}){
 let pending;
 async function read(){
  const time=now(),day=dateKey(time),key='fx:bhs-v8:'+day;
  const cached=(await ledger.get(key))?.value;
  if(validFx(cached,time))return cached;
  for(let attempt=0;attempt<2;attempt++){
   let response;
   try{response=await fetchImpl('https://www.tcmb.gov.tr/kurlar/today.xml',{signal:AbortSignal.timeout(10000),redirect:'error'});}
   catch{continue;}
   if(!response.ok)continue;
   let xml;
   try{xml=await response.text();}catch{continue;}
   const usd=xml.match(/<Currency\b[^>]*(?:CurrencyCode|Kod)="USD"[^>]*>([\s\S]*?)<\/Currency>/);
   const rate=Number(usd?.[1].match(/<ForexSelling>([\d.]+)<\/ForexSelling>/)?.[1]);
   const date=xml.match(/Tarih="(\d{2})\.(\d{2})\.(\d{4})"/);
   const snapshot={usdTry:rate,publishedAt:date?[date[3],date[2],date[1]].join('-'):'',conversionAllowance:.03};
   if(!validFx(snapshot,time))throw new BudgetError('fx_limit','Güncel kur güvenli BHS bütçesiyle eşleşmiyor.');
   return ledger.once(key,{day},0,async()=>snapshot);
  }
  for(let offset=1;offset<=7;offset++){
   const prior=(await ledger.get('fx:bhs-v8:'+dateKey(time-offset*dayMs)))?.value;
   if(validFx(prior,time))return prior;
  }
  throw new BudgetError('fx_unavailable','BHS için güncel kur doğrulanamadı.');
 }
 return ()=>pending??=(read().catch(error=>{pending=undefined;throw error;}));
}
