import {snapshotBrief,briefHash} from '../../src/bhs/brief.mjs';
import {directAuditResult} from '../../src/bhs/direct-report.mjs';
import {pricingEngine} from '../../src/engines/pricing-engine.mjs';
import {proposalEngine} from '../../src/engines/proposal-engine.mjs';
import {addQuote,rateSource} from '../../src/pricing/currency.mjs';
import {brief as base,fixture as reportFixture} from './bhs.mjs';
export const sourceId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222';
export const fx={provider:'TCMB',kind:'ForexSelling',base:'USD',quote:'TRY',rate:44.1234,publishedAt:'2026-10-21',checkedAt:'2026-10-21T17:00:00.000Z',source:rateSource};
export async function offerFixture(currency='TRY'){
 const brief=snapshotBrief({...base,services:'Meta ve Google Ads'}),synthesis={report:reportFixture(),methodologyVersion:'synthetic-test-v1'};
 const audit={stage:'audit',...directAuditResult(brief,synthesis)};
 const scope={summary:'Seçili kanallar.',budget:{posture:'unspecified',quote:null,targetQuote:null,targetScope:'unspecified'},services:['meta','google_ads'].map(serviceId=>({serviceId,phase:'start',priority:1,reason:'Konuşulan hizmet.',briefQuote:brief.services,findingIds:[]})),exclusions:['Reklam harcaması dahil değildir.']};
 const copy={headline:'Net hedefler.',accent:'Birlikte büyüme.',subtitle:'Görüşme kapsamına göre işbirliği teklifimiz.',findingIds:[]};
 Object.assign(audit.data,{scopePlan:scope,proposalCopy:copy});
 const pricing={stage:'pricing',...addQuote(await pricingEngine.run({brief,scope},{audit}),{currency,exchangeRate:fx})};
 const logo={stage:'logo',status:'review',data:{generated:false,sourceType:'upload',candidates:[{image:'data:image/png;base64,AAA',source:'data:image/png;base64,AAA',placement:{background:'#ffffff'},quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]}};
 const document=(await proposalEngine.run({brief,copy},{audit,pricing,logo})).data;document.logo.reviewed=true;
 return {brief,synthesis,scope,copy,audit,pricing,logo,row:{id:sourceId,lead_id:'lead-1',space_id:'space-1',version:1,state:'draft',created_at:'2026-10-21T17:00:00Z',monthly_amount:document.valueSync.amount,customer_document:document,pricing_snapshot:pricing.data},hash:briefHash(brief)};
}
export function memoryLedger(seed=[]){
 const rows=new Map(seed);return {rows,begin:async()=>({chargedKurus:500,capKurus:5000}),status:async()=>({chargedKurus:500,capKurus:5000}),get:async key=>rows.get(key)||null,once:async(key,input,amount,run)=>{if(rows.has(key))return rows.get(key).value;const value=await run();rows.set(key,{state:'complete',value});return value;}};
}
export const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
