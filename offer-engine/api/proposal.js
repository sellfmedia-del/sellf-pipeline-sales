import {proposalLanguage,localizeProposal} from '../src/proposal/language.mjs';
import {draftBudgetFor,draftBudgetCapKurus,BudgetError} from '../src/budget/ledger.mjs';
import {researchTariff} from '../src/bhs/research-tariff.mjs';
import {createRuntimeProviders as createBoundedProviders} from '../src/budget/providers.mjs';
import {quoteCurrency} from '../src/pricing/currency.mjs';
import {offersEnabled,authorizeProduction} from '../src/runtime.mjs';
import {randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {interactionId,modelText} from '../src/bhs/provider.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {normalizePlan,compositionHash} from '../src/proposal/composition.mjs';
import {implementationContext,writeImplementation} from '../src/proposal/implementation-plan.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {assertResult} from '../src/contracts.mjs';
import {offerGeminiKey} from '../src/config.mjs';
const proposalErrors={
 session:'Pipeline oturumunu yenileyip tekrar dene.',
 request:'Teklif isteği okunamadı. Açık taslağa dönüp tekrar dene.',
 brief:'Teklif briefini kontrol et.',
 pricing:'Teklif fiyat kaydı değişmiş veya süresi dolmuş. Mevcut BHS üzerinden fiyatları yeniden hesapla.',
 logo:'Logo kaydı doğrulanamadı. Logoyu yeniden doğrula ve teklifi oluştur.',
 scope:'Teklif kapsamını veya manuel başlangıç planını kontrol et.',
 composition:'Teklif belgesi oluşturulamadı. Mevcut BHS ve fiyat kaydı korunuyor.'
};
export function createProposalHandler({getProvider=null,getSecret=offerGeminiKey,getLedger=draftBudgetFor,getProviders=createBoundedProviders,now=Date.now,logger=console}={}){
 const starts=new Map();
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'Teklif servisi yalnızca korumalı önizlemede açık.'});
  if(req.method==='GET')return res.status(200).json({configured:Boolean(getSecret()),provider:'Gemini',pricesFrom:'pricing-engine',logoFrom:'logo-engine',customerAlternatives:2});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  const requestId=randomUUID();
  res.setHeader('X-Offer-Request-Id',requestId);
  let stage='session';
  const logFailure=(code,detail)=>{try{logger.warn?.(JSON.stringify({event:'proposal_failure',requestId,code,...(detail?{detail}:{})}));}catch{/* Diagnostics must not change the outcome. */}};
  try{
   await authorizeProduction(req);
   stage='request';
   if(Number(req.headers['content-length'])>4200000)throw Error();
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||JSON.stringify(body).length>4200000)throw Error();
   stage='brief';
   const brief=snapshotBrief(body.brief),hash=briefHash(brief),secret=getSecret(),codec=createPricingProof(secret);
   stage='session';
   const session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!session)throw Error();
   stage='pricing';
   const approval=codec.decode(body.proposalProof,session,host,now());
   if(approval.kind!=='pricing_ready'||approval.briefHash!==hash||approval.auditHash!==digest(body.audit)||approval.pricingHash!==digest(body.pricing))throw Error();
   assertResult('audit',body.audit);assertResult('pricing',body.pricing);
   if(quoteCurrency(body.brief?.currency)!==(body.pricing.data.quote?.currency||'TRY'))throw Error('Teklif para birimi fiyat kaydıyla eşleşmiyor.');
   stage='logo';
   const {logoProof:receipt,...logoData}=body.logo||{};
   if(typeof receipt!=='string'||!receipt)throw Error();
   logoProof(secret,host,logoData,receipt);
   const logo={stage:'logo',status:'review',data:logoData};assertResult('logo',logo);
   if(body.logoBackground&&!['#ffffff','#171717','#626262'].includes(body.logoBackground))throw Error();
   stage='scope';
   const context={leadId:body.context?.leadId,spaceId:body.context?.spaceId};
   if(Object.values(context).some(v=>typeof v!=='string'||!v||v.length>200))throw Error();
   const language=proposalLanguage(body.brief?.language),plan=normalizePlan(body),inputHash=compositionHash(brief,body.audit,body.pricing,logo,{...plan,context,logoBackground:body.logoBackground,language});
   const claims={...context,briefHash:hash,auditHash:approval.auditHash,pricingHash:approval.pricingHash,inputHash,...(approval.sourceOfferId?{sourceOfferId:approval.sourceOfferId}:{})};
   if(!getProvider){
    if(!approval.budgetLeadId||approval.budgetLeadId!==context.leadId||body.action!=='start')throw Error();
    stage='composition';
    const planInput={planMode:plan.mode,manualSteps:plan.manualSteps,bhsCalendar:plan.bhsCalendar};
    let result=await proposalEngine.run({brief,copy:body.audit.data.proposalCopy,...planInput,logoBackground:body.logoBackground,now:now()},{audit:body.audit,pricing:body.pricing,logo});
    assertResult('proposal',result);
    const basePlanStatus=Object.values(result.data.plans).some(p=>p.steps.some(s=>s.bhsActions?.length))?'bhs_retained':'standard';
    let implementation;
    try{implementation=implementationContext(result.data,brief,body.audit.data,body.pricing.data,plan.mode);}
    catch{logFailure('proposal_assessment_unavailable');}
    let draftCost,draftPlanStatus,draftPlanReview;
    if(language==='en'||implementation){
     let ledger;
     try{
      // Only signed workflow IDs choose the budget. Repricing, retries and
      // changes to the draft text all share the same account.
      const scope=digest(['proposal-draft-v1',approval.budgetResearchRunId??null,approval.sourceOfferId??null]);
      ledger=await getLedger(req,res,context.leadId,{scope});
      draftCost=await ledger.begin();
      if(draftCost.capKurus!==draftBudgetCapKurus)throw new BudgetError('draft_budget_unavailable','Bağımsız teklif taslağı bütçesi doğrulanamadı.');
      const providers=getProviders({ledger,pricing:researchTariff});
      const reviewOptions={onImplementationReview:review=>{draftPlanReview=review;}};
      const data=language==='en'?await localizeProposal(result.data,language,{providers,implementation,...reviewOptions}):
       await writeImplementation(result.data,implementation,providers,reviewOptions);
      const candidate={...result,data};
      assertResult('proposal',candidate);
      result=candidate;
      if(implementation){
       const completed=draftPlanReview?draftPlanReview.groups.filter(group=>['accepted','normalized'].includes(group.status)).length:
        data.pricingMode==='monthly'?data.plans.operations_bundle.steps.filter(s=>s.measurement).length:
         implementation.groups.filter(group=>data.plans[group.id].steps.every(s=>s.measurement)).length;
       draftPlanStatus=completed===implementation.groups.length?'brief_linked':completed?'partial':basePlanStatus;
      }
      draftCost=await ledger.status();
     }
     catch(error){
      logFailure('proposal_enrichment_unavailable',error.code==='budget_limit'?'budget_limit':'unavailable');
      try{if(ledger)draftCost=await ledger.status();}catch{}
      const message=error.code==='budget_limit'?'İngilizce taslak, taslak için ayrılan 10 TL’lik bütçenin kalan tutarına sığmadı. BHS ve fiyatlar hazır.':
       error instanceof BudgetError?error.message:'İngilizce teklif taslağı hazırlanamadı. BHS ve fiyatlar hazır.';
      if(language==='en')return res.status(422).json({code:error.code||'translation_unavailable',error:message,...(draftCost?.capKurus===draftBudgetCapKurus?{draftCost}:{})});
      draftPlanStatus??=basePlanStatus;
      if(implementation)draftPlanReview={groups:implementation.groups.map(group=>({groupId:group.id,...(group.month?{month:group.month}:{}),
       status:'rejected',reasons:[{code:error.code==='budget_limit'?'budget_limit':'generation_unavailable'}]}))};
     }
    }
    const envelope={...result,stage:'proposal',engineVersion:proposalEngine.version,inputHash,runId:randomUUID()};assertResult('proposal',envelope);
    return res.status(200).json({phase:'complete',result:envelope,...(draftCost?.capKurus===draftBudgetCapKurus?{draftCost}:{}),
     ...(draftPlanStatus?{draftPlanStatus}:{}),...(draftPlanReview?{draftPlanReview}:{}),saveProof:codec.encode({kind:'proposal_ready',createdAt:now(),...claims,proposalHash:digest(envelope)},session,host)});
   }
   if(language!=='tr')throw Error('İngilizce teklif için bütçeli çeviri gerekli.');
   const provider=getProvider();
   if(!provider.configured())throw Error();
   if(body.action==='start'){
    if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId))throw Error();
    for(const[k,v]of starts)if(now()-v.at>7200000)starts.delete(k);
    const key=session+':'+body.requestId;
    if(starts.has(key)&&starts.get(key).hash!==inputHash)throw Error();
    if(!starts.has(key)){if(starts.size>=200)throw Error();starts.set(key,{at:now(),hash:inputHash,promise:provider.composeProposal(brief,body.audit.data,body.pricing.data)});}
    const job=await starts.get(key).promise;
    return res.status(202).json({phase:'composition',ticket:codec.encode({kind:'proposal_job',createdAt:now(),...claims,id:interactionId(job.id)},session,host)});
   }
   const ticket=codec.decode(body.ticket,session,host,now());
   if(ticket.kind!=='proposal_job'||ticket.inputHash!==inputHash||!['status','cancel'].includes(body.action))throw Error();
   if(body.action==='cancel'){await provider.cancel(interactionId(ticket.id));return res.status(200).json({status:'cancelled'});}
   if(now()-ticket.createdAt>180000)throw Error();
   const job=await provider.poll(interactionId(ticket.id));
   if(['queued','in_progress'].includes(job.status))return res.status(200).json({phase:'composition',ticket:body.ticket});
   if(job.status!=='completed')throw Error();
   let result=await proposalEngine.run({brief,copy:JSON.parse(modelText(job)),planMode:plan.mode,manualSteps:plan.manualSteps,bhsCalendar:plan.bhsCalendar,logoBackground:body.logoBackground,now:now()},{audit:body.audit,pricing:body.pricing,logo});
   const envelope={...result,stage:'proposal',engineVersion:proposalEngine.version,inputHash,runId:randomUUID()};assertResult('proposal',envelope);
   return res.status(200).json({phase:'complete',result:envelope,saveProof:codec.encode({kind:'proposal_ready',createdAt:now(),...claims,proposalHash:digest(envelope)},session,host)});
  }catch{
   const code='proposal_'+stage;
   logFailure(code);
   return res.status(422).json({code,error:proposalErrors[stage],requestId});
  }
 };
}
export default createProposalHandler();
