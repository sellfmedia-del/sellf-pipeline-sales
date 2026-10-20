import {snapshotBrief,briefHash} from '../bhs/brief.mjs';
import {assertResult} from '../contracts.mjs';
import {validateCopy,normalizePlan,buildPlans} from '../proposal/composition.mjs';
import {digest} from '../pricing/proof.mjs';
export const proposalEngine=Object.freeze({id:'proposal',version:'0.2.0',async run(input,dependencies={}){
 const brief=snapshotBrief(input.brief),{audit,pricing,logo}=dependencies;
 for(const [name,result]of Object.entries({audit,pricing,logo}))assertResult(name,result);
 if(audit.status!=='ready'||audit.data.briefHash!==briefHash(brief)||pricing.data.briefHash!==briefHash(brief))throw Error('Teklif girdileri aynı doğrulanmış brief için olmalı.');
 const plan=normalizePlan(input),copy=validateCopy(input.copy,audit.data),candidate=logo.data.candidates[0];
 const background=input.logoBackground||candidate.placement?.background||'#ffffff';
 if(!['#ffffff','#171717','#626262'].includes(background))throw Error('Logo zemini geçersiz.');
 const alternatives=pricing.data.alternatives.map(a=>({id:a.id,name:a.name,billingPeriod:'monthly',monthlyAmount:a.monthlyAmount,services:[...(a.id==='growth_operations'?[{id:'growth',name:'Growth danışmanlığı ve strateji',description:'Tam BHS, onaylanan strateji ve uygulama planıyla Growth danışmanlığı.'}]:[]),...a.services.map(s=>({id:s.serviceId,name:s.name,description:s.deliverables||s.reason}))]}));
 return {status:pricing.status==='review'||logo.status==='review'?'review':'ready',data:{schemaVersion:'proposal-v1',brand:{name:brief.brandName,website:brief.website},copy,logo:{image:candidate.image,background,reviewed:logo.data.reviewed===true},currency:'TRY',alternatives,recommendedAlternativeId:pricing.data.recommendedAlternativeId,plans:buildPlans(plan,pricing.data),bhs:{...audit.data.report,summary:audit.data.summary,dimensions:audit.data.dimensions,findings:audit.data.findings,sources:audit.data.sources,scoring:audit.data.scoring,rawReport:audit.data.rawReport,meetingQuestions:audit.data.meetingQuestions},exclusions:pricing.data.scope.exclusions,deferred:pricing.data.scope.deferred.map(s=>({name:s.name,reason:s.reason})),pending:pricing.data.scope.pending.map(s=>({name:s.name,reason:s.reason})),notices:pricing.data.notices,sections:['intro','bhs','alternatives','scope','plan','contract'],createdAt:new Date(input.now||Date.now()).toISOString(),provenance:{briefHash:briefHash(brief),auditHash:digest(audit),pricingHash:digest(pricing),logoHash:digest(logo),costVersion:pricing.data.costVersion,costSnapshotHash:pricing.data.costSnapshotHash},valueSync:{performed:false,amount:alternatives.find(a=>a.id===pricing.data.recommendedAlternativeId).monthlyAmount}}};
}});
