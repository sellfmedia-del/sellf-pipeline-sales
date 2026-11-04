// Isolated QA helpers. Production routing and the production tariff are unchanged.
import {createHash} from 'node:crypto';
import {assertSchema} from '../src/bhs/schema.mjs';
import {completeDirectReportSchema} from '../src/bhs/direct-report.mjs';
import {groundOfferReport} from '../src/bhs/source-gate.mjs';
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Reviewed against Google Developer API Standard pricing on 2026-11-04.
// These are conservative QA reservations at 60 TRY/USD plus 20%, not invoices.
export const candidates=[
 {id:'gemini-3.6-flash',input:.75,output:3.75},
 {id:'gemini-3.8-flash',input:.75,output:3.75},
 {id:'gemini-2.5-pro',input:1.25,output:10,legacy:true},
 {id:'gemini-3.1-pro-preview',input:2,output:12},
 {id:'gemini-4-argon',input:2,output:10}
];
export function createAllowance(capKurus=5000,previousEntries=[]){
 const entries=structuredClone(previousEntries);
 if(entries.some(e=>!candidates.some(m=>m.id===e.model)||!Number.isSafeInteger(e.committedKurus)||e.committedKurus<0||e.committedKurus>e.reservedKurus))throw Error('invalid_prior_receipts');
 let committed=entries.reduce((sum,e)=>sum+e.committedKurus,0);
 if(committed>capKurus)throw Error('comparison_budget_limit');
 return {get committed(){return committed;},get entries(){return entries;},capKurus,
  reserve(model,inputTokens,outputTokens,label){
   if(!Number.isSafeInteger(inputTokens)||inputTokens<1||inputTokens>190000||!Number.isSafeInteger(outputTokens)||outputTokens<1||outputTokens>16384)throw Error('invalid_token_envelope');
   const inputUpper=Math.ceil(inputTokens*1.2)+4096;
   const amount=Math.ceil((inputUpper*model.input+outputTokens*model.output)/1e6*7200);
   if(committed+amount>capKurus)throw Error('comparison_budget_limit');
   const entry={model:model.id,label,reservedKurus:amount,committedKurus:amount,usageVerified:false,inputUpper,outputUpper:outputTokens};entries.push(entry);committed+=amount;return entry;
  },
  settle(entry,usage){
   const input=usage?.promptTokenCount,output=(usage?.candidatesTokenCount||0)+(usage?.thoughtsTokenCount||0);
   if(!entries.includes(entry)||entry.usageVerified||!Number.isSafeInteger(input)||input<1||!Number.isSafeInteger(usage?.candidatesTokenCount)||usage.candidatesTokenCount<1||!Number.isSafeInteger(output)||output<1||input>entry.inputUpper||output>entry.outputUpper||usage.totalTokenCount!==input+output)return false;
   const model=candidates.find(m=>m.id===entry.model);if(!model)return false;
   const amount=Math.ceil((input*model.input+output*model.output)/1e6*7200);
   if(amount>entry.reservedKurus)return false;
   committed-=entry.committedKurus-amount;entry.committedKurus=amount;entry.usageVerified=true;entry.tokens={input,output};return true;
  }
 };
}
export function reviewReport(raw,context){
 let schemaError=null;try{assertSchema(raw,completeDirectReportSchema);}catch(error){schemaError=error.message;}
 let safe;try{safe=groundOfferReport(raw,context);}catch{return {schemaError,reviewable:false};}
 const issues=safe.transfer.issues,counts={rawFindings:raw.findings?.length||0,retainedFindings:safe.findings.length,rawSources:raw.sources?.length||0,retainedSources:safe.sources.length,retainedCompetitors:safe.competitors.length,dimensions:safe.dimensions.length,coverage:safe.researchCoverage.length,availableAreas:safe.researchCoverage.filter(a=>a.status!=='unavailable').length,meetingQuestions:safe.meetingQuestions.length};
 return {schemaError,reviewable:true,counts,issues,automatedGate:!schemaError&&!issues.length&&counts.retainedCompetitors>=3&&counts.dimensions===6&&counts.coverage===24&&counts.meetingQuestions>=5,manualSemanticReview:'pending',safe};
}
