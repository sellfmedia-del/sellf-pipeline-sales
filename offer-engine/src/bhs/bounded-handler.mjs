import {hasGroundedResearch} from './research-content.mjs';
import {offersEnabled,productionOffers} from '../runtime.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash,validatePublicBrief} from './brief.mjs';
import {createPricingProof,digest} from '../pricing/proof.mjs';
import {budgetFor,hash as ledgerHash,tariff,tariffReadiness,BudgetError} from '../budget/ledger.mjs';
import {createRuntimeProviders as createBoundedProviders} from '../budget/providers.mjs';
import {phases,stageKey} from './direct-research.mjs';
import {auditEngine} from '../engines/audit-engine.mjs';
import {offerGeminiKey} from '../config.mjs';
import {temporaryDnsError} from '../network-dns.mjs';
import {runtimeStore,bearer} from '../runtime.mjs';
import {recoveryKey,recoveryRound,recoverableAuditCodes} from '../budget/recovery.mjs';
import {canContinue,abandonedStage,continuationAudit,restoreContinuation} from './continuity.mjs';
import {validateScope,fallbackScope} from '../pricing/scope.mjs';
import {offerCopy} from '../proposal/composition.mjs';
import {createSupervisedProviders,supervisedModels} from './supervised-providers.mjs';
import {supervisedPhases} from './supervised-research.mjs';
import {sequentialPhases} from './sequential-contracts.mjs';
import {collectionFirstEnabled,createSequentialProviders} from './sequential-providers.mjs';
import {researchTariff} from './research-tariff.mjs';
import {backgroundBhsEnabled,browserBhsJobStore,queuedBhsBrief} from './job-store.mjs';
import {managedPhaseBudget} from './managed-budget.mjs';
import {managedBrandContinuation} from './managed-report.mjs';
import {recoverManagedSectionSynthesis} from './collection-first.mjs';
import {resolveManagedGaps} from './managed-gaps.mjs';

// Preview opt-in only. Production activation remains a separate reviewed change.
const supervisedPreview=()=>process.env.VERCEL_ENV==='preview'&&['v7','v8'].includes(process.env.OFFER_BHS_RESEARCH_VERSION);
const sequentialProduction=()=>productionOffers()&&process.env.OFFER_BHS_RESEARCH_VERSION==='v8'&&process.env.OFFER_BHS_SEQUENTIAL_PRODUCTION_ENABLED==='true'&&backgroundBhsEnabled();
const researchVersion=()=>supervisedPreview()?process.env.OFFER_BHS_RESEARCH_VERSION:sequentialProduction()?'v8':'v6';
const researchModel=()=>supervisedPreview()||sequentialProduction()?supervisedModels.manager:process.env.OFFER_BHS_PRIMARY_MODEL||'gemini-2.5-pro';
const researchProviders=options=>options.researchVersion==='v8'?createSequentialProviders(options):options.researchVersion==='v7'?createSupervisedProviders(options):createBoundedProviders(options);

function backgroundHandoffReason(job,now){
 if(job.cancelRequested)return 'research_cancelled';
 if(now-job.createdAt>=20*60000)return 'research_deadline';
 if(job.state==='queued'&&now-job.updatedAt>=3*60000)return 'queue_stalled';
 if(job.state==='running'&&now-job.leaseUntil>=30000)return 'lease_expired';
 return null;
}

export function createBoundedAuditHandler({getLedger=budgetFor,getGapLedger=null,getProviders=researchProviders,getSecret=offerGeminiKey,getResearchModel=researchModel,getResearchVersion=researchVersion,getQueue=browserBhsJobStore,isBackgroundEnabled=backgroundBhsEnabled,validateWebsite=validatePublicBrief,runStage=options=>auditEngine.runStage(options),getSourceOffer=(req,id)=>runtimeStore().detail(bearer(req),id),now=Date.now,logger=console}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'BHS yalnızca test önizlemesinde açık.'});
  if(req.method==='GET'){
   const version=getResearchVersion(),supervised=['v7','v8'].includes(version),pricing=version==='v8'?researchTariff:tariff;
   return res.status(200).json({configured:Boolean(getSecret()&&(!supervised||process.env.ANTHROPIC_API_KEY)&&(process.env.OFFER_TAVILY_API_KEY||process.env.TAVILY_API_KEY)&&process.env.OFFER_STORAGE_GATEWAY_KEY),provider:supervised?'Claude Sonnet + Gemini Flash-Lite + Tavily':'Tavily + Gemini Pro',execution:version==='v8'&&isBackgroundEnabled()?'background':'browser',...(version==='v8'?{collectionFirst:collectionFirstEnabled()}:{}),costCapTry:50,costLedger:'durable-per-lead',primaryModel:getResearchModel(),modelTransport:process.env.OFFER_MODEL_TRANSPORT||'google',tariffVersion:pricing.version,tariffReadiness:tariffReadiness(now(),pricing),qualityBenchmark:'not_requested',contentReview:false});
  }
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  const requestId=/^[a-zA-Z0-9_-]{16,80}$/.test(req.headers['x-offer-request-id']||'')?req.headers['x-offer-request-id']:randomUUID();res.setHeader('X-Offer-Request-Id',requestId);
  let phase='unknown',action='unknown',readCost,recoveryTicket,activeLedger,activeBrief,activeResearchVersion,activeCheckpointHash;
  const log=(event,extra={})=>{try{(event==='bhs_error'?logger.error:logger.info)?.call(logger,JSON.stringify({event,requestId,phase,action,...extra}));}catch{}};
  try{
   if(Number(req.headers['content-length'])>100000)throw new BudgetError('invalid_brief','Brief boyut sınırını aşıyor.');
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>100000)throw Error();
   const brief=snapshotBrief(body.brief),hash=briefHash(brief),codec=createPricingProof(getSecret());action=body.action;
   let session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1],job;
   if(action==='start'){
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(body.requestId||''))throw Error();
    job={kind:'bounded_audit',createdAt:now(),briefHash:hash,auditHash:hash,leadId:body.context?.leadId,spaceId:body.context?.spaceId,researchVersion:getResearchVersion(),researchModel:getResearchModel()};
    if(body.context?.researchRunId!==undefined){
     if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.context.researchRunId))throw new BudgetError('budget_context','Teklif çalışması geçersiz.');
     job.researchRunId=body.context.researchRunId;
    }
    if(body.context?.sourceOfferId){
     if(!/^[a-f0-9-]{36}$/.test(body.context.sourceOfferId)||!/^[a-f0-9-]{36}$/.test(body.context.researchRunId||''))throw Error('Teklif kaydı geçersiz.');
     const source=await getSourceOffer(req,body.context.sourceOfferId);
     if(source.lead_id!==job.leadId||source.space_id!==job.spaceId)throw Error('Teklif farklı karta ait.');
     job.sourceOfferId=source.id;job.researchRunId=body.context.researchRunId;
    }
   }else{
    if(!session)throw new BudgetError('invalid_job','Araştırma oturumu bulunamadı.');
    job=codec.decode(body.ticket,session,host,now());if(job.kind!=='bounded_audit'||job.briefHash!==hash)throw new BudgetError('changed_brief','Brief araştırma kaydıyla eşleşmiyor.');
   }
   const researchVersion=job.researchVersion||'v3';if(!['v3','v4','v5','v6','v7','v8'].includes(researchVersion))throw new BudgetError('invalid_job','Araştırma sürümü geçersiz.');activeResearchVersion=researchVersion;
   if(job.researchModel&&!(['v7','v8'].includes(researchVersion)?job.researchModel===supervisedModels.manager:['gemini-2.5-pro','gemini-3.1-pro-preview','gemini-4-argon'].includes(job.researchModel)))throw new BudgetError('model_budget','BHS için onaylı üst model gerekli.');
   const activePhases=researchVersion==='v8'?sequentialPhases:researchVersion==='v7'?supervisedPhases:phases;
   const queue=researchVersion==='v8'&&isBackgroundEnabled()?await getQueue(req,res):null;
   if(queue&&action==='start'){
    if(productionOffers()&&job.researchRunId)job.queueBriefHash=queuedBhsBrief(brief,job.researchRunId).hash;
    const existing=await queue.find(job.leadId,job.queueBriefHash||hash);
    if(existing){
     if(job.queueBriefHash&&existing.researchRunId!==job.researchRunId)
      throw new BudgetError('invalid_job','BHS işi yeni çalışma kimliğiyle eşleşmiyor.');
     job.backgroundJobId=existing.id;
     if(existing.researchRunId)job.researchRunId=existing.researchRunId;else delete job.researchRunId;
     if(existing.sourceOfferId)job.sourceOfferId=existing.sourceOfferId;else delete job.sourceOfferId;
    }
   }
   const checkpointHash=job.queueBriefHash||hash;activeCheckpointHash=checkpointHash;
   const key=name=>stageKey(brief,name,researchVersion,checkpointHash);
   let ledger=await getLedger(req,res,job.leadId,...(job.researchRunId?[{researchRunId:job.researchRunId}]:[]));activeLedger=ledger;activeBrief=brief;
   let websiteUnavailable=false;
   if(action==='start'){
    phase='website_check';
    try{await validateWebsite(brief);}
    catch(error){
     if(!queue||!temporaryDnsError(error))throw error;
     // A transient DNS lookup cannot authorize research. An existing job can
     // still be read, and a new offer can use the signed zero-cost handoff.
     websiteUnavailable=!job.backgroundJobId;
     log('bhs_website_lookup_deferred',{code:error.code});
    }
    phase='budget_init';await ledger.begin();
    if(!session){session=randomBytes(32).toString('base64url');const existing=res.getHeader?.('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:existing?[existing]:[]),'__Host-offer-research='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200']);}
   }
   // Display baseline only: never reset the durable ledger or its reservations.
   if(action==='start')job.attemptStartKurus=(await ledger.status()).chargedKurus;
   const ticket=codec.encode(job,session,host),cost=async()=>{
    const total=await ledger.status();
    const breakdown=ledger.describe?.(total);
    return {...total,...(breakdown?{breakdown}:{}),...(Number.isSafeInteger(job.attemptStartKurus)?{attemptChargedKurus:Math.max(0,total.chargedKurus-job.attemptStartKurus)}:{})};
   };readCost=cost;recoveryTicket=ticket;
   if(action==='cancel'){if(queue&&job.backgroundJobId)await queue.cancel(job);return res.status(200).json({status:'cancelled',cost:await cost()});}
   if(action==='preflight'){
    if((await ledger.get('audit:managed-policy:'+hash))?.state==='complete')throw new BudgetError('invalid_phase','Tamamlanan veya devam eden BHS için ayrı sağlayıcı çağrısı başlatılamaz.');
    const providers=getProviders({ledger});
    const probe=await providers.generate('provider_preflight',{instruction:'Return the JSON object with ok=true. No additional text.'},{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},{model:'gemini-4-argon',maxOutputTokens:1024,thinkingLevel:'LOW'});
    log('bhs_provider_preflight',{model:probe.model,ok:probe.data?.ok===true,cost:await cost()});return res.status(200).json({ok:probe.data?.ok===true,cost:await cost()});
   }
   if(!['start','status','advance','recover','continue','complete_gaps'].includes(action))throw Error();
   if(action==='complete_gaps'&&(!queue||!job.backgroundJobId))throw new BudgetError('completion_unavailable','Tamamlanmış BHS kaydı gerekli.');
   const finish=async (final,gapCompletion)=>{
    const result={...final,stage:'audit',engineVersion:'direct-bhs-pro-'+researchVersion,inputHash:hash,runId:digest({leadId:job.leadId,hash:checkpointHash}),cost:await cost()};
    const pricingProof=result.status==='ready'?codec.encode({kind:'audit_ready',createdAt:now(),briefHash:hash,auditHash:digest(result),budgetLeadId:job.leadId,...(job.researchRunId?{budgetResearchRunId:job.researchRunId}:{}),...(job.sourceOfferId?{sourceOfferId:job.sourceOfferId,auditOrigin:{briefHash:hash,researchRunId:job.researchRunId}}:{})},session,host):null;
    log('bhs_response',{phase:'complete',status:result.status,cost:result.cost,continuity:result.data.researchContinuity?.status||null});return res.status(200).json({phase:'complete',result,pricingProof,cost:result.cost,...(gapCompletion?{gapCompletion,ticket:recoveryTicket}:{})});
   };
   if(websiteUnavailable){
    const partial=continuationAudit(brief,{reason:'website_network_busy',managed:true});
    return await finish(await restoreContinuation(brief,partial,ledger,now()));
   }
   let backgroundJob,handoffReason;
   if(queue&&action!=='continue'){
    if(!job.backgroundJobId){
     const saved=await queue.enqueue(job,brief,await ledger.status());job.backgroundJobId=saved.id;
     // A concurrent start may have won after find(). Bind to its original account.
     if(saved.budgetId!==(await ledger.status()).id){
      if(job.queueBriefHash)throw new BudgetError('invalid_job','BHS işi yeni çalışma bütçesiyle eşleşmiyor.');
      if(saved.researchRunId)job.researchRunId=saved.researchRunId;else delete job.researchRunId;
      if(saved.sourceOfferId)job.sourceOfferId=saved.sourceOfferId;else delete job.sourceOfferId;
      ledger=await getLedger(req,res,job.leadId,...(job.researchRunId?[{researchRunId:job.researchRunId}]:[]));activeLedger=ledger;
      job.attemptStartKurus=(await ledger.status()).chargedKurus;
     }
    }
    backgroundJob=await queue.read(job);
    const updatedTicket=codec.encode(job,session,host);recoveryTicket=updatedTicket;
    if((backgroundJob.queueBriefHash||backgroundJob.briefHash)!==checkpointHash||backgroundJob.budgetId!==(await ledger.status()).id)throw new BudgetError('invalid_job','BHS işi araştırma bütçesiyle eşleşmiyor.');
    if(action==='complete_gaps'&&!['complete','paused','cancelled'].includes(backgroundJob.state))throw new BudgetError('completion_unavailable','Ek araştırma için incelenmiş bir BHS sonucu gerekli.');
    if(['queued','running'].includes(backgroundJob.state)){
     handoffReason=backgroundHandoffReason(backgroundJob,now());
     if(!handoffReason)return res.status(202).json({phase:backgroundJob.phase,status:'in_progress',ticket:updatedTicket,cost:await cost(),execution:'background',continuationAvailable:true});
     if(!backgroundJob.cancelRequested)backgroundJob=await queue.cancel(job);
     log('bhs_automatic_continuation',{reason:handoffReason,jobPhase:backgroundJob.phase});
    }
   }
   const pendingPhases=activePhases.filter(x=>x!=='complete');
   const rows=await Promise.all(pendingPhases.map(name=>ledger.get(key(name))));
   const previous=async name=>rows[pendingPhases.indexOf(name)]?.value;
   const finishGaps=async(synthesis,audit)=>{
    const canComplete=['complete','paused','cancelled'].includes(backgroundJob?.state)&&synthesis?.supervision?.reviewMode==='managed-audit'
     &&(backgroundJob.state==='complete'||synthesis.supervision.researchPlan)&&(productionOffers()||getGapLedger);
    if(!canComplete){
     if(action==='complete_gaps')throw new BudgetError('completion_unavailable','Ek araştırma için kaydedilmiş bir BHS sonucu gerekli.');
     return {};
    }
    const gap=await resolveManagedGaps({action,brief,synthesis,secret:getSecret(),sections:audit.data.bhsSections.filter(section=>!section.complete).map(section=>section.id),baseLedger:ledger,
     getGapLedger:id=>getGapLedger?getGapLedger(req,res,job.leadId,id):getLedger(req,res,job.leadId,{researchRunId:id}),getProviders,previous});
    if(!gap)return {};
    const {synthesis:updated,...gapCompletion}=gap;
    return {updated,gapCompletion};
   };
   if(queue&&action==='continue'){
    backgroundJob=await queue.read(job);
    if((backgroundJob.queueBriefHash||backgroundJob.briefHash)!==checkpointHash||backgroundJob.budgetId!==(await ledger.status()).id)throw new BudgetError('invalid_job','BHS işi araştırma bütçesiyle eşleşmiyor.');
    if(['queued','running'].includes(backgroundJob.state))backgroundJob=await queue.cancel(job);
   }
   if(backgroundJob&&backgroundJob.state!=='complete'){
    if(!['paused','cancelled'].includes(backgroundJob.state)&&!(backgroundJob.state==='running'&&backgroundJob.cancelRequested))throw new BudgetError('continuation_unavailable','Araştırmanın durdurulduğu doğrulanamadı.');
    const synthesis=rows[pendingPhases.indexOf('synthesis')];phase=backgroundJob.phase;
    const reason=handoffReason||backgroundJob.diagnostic?.code||(backgroundJob.cancelRequested||backgroundJob.state==='cancelled'?'research_cancelled':'stage_paused');
    const brand=rows[pendingPhases.indexOf('brand')];
    const policy=await ledger.get('audit:managed-policy:'+hash);
    const managed=policy?.state==='complete';
    let usable=synthesis?.state==='complete'?synthesis.value:undefined;
    if(!usable&&phase==='synthesis'&&managed&&policy.value?.version===2){
     try{
      usable=await recoverManagedSectionSynthesis(brief,previous,{readCheckpoint:async(name,input)=>{
        const step=await ledger.get('audit:v8:checkpoint:'+name+':'+ledgerHash(input));
        return step?.state==='complete'?step.value:undefined;
      }});
     }catch(error){log('bhs_section_restore_unavailable',{code:error.code||'stage_failed'});}
    }
    const partial=await ledger.once('audit:continuation:v1:'+phase+':'+hash,{briefHash:hash,phase},0,async()=>{
     usable??=managed&&brand?.state==='complete'?managedBrandContinuation(brief,brand.value):undefined;
     return continuationAudit(brief,{synthesis:usable,reason,managed});
    });
    const {updated,gapCompletion}=await finishGaps(usable,partial);
    if(updated){
     const audit=await auditEngine.run({brief,synthesis:updated});
     if(audit.status==='ready')return await finish({...audit,data:{...audit.data,scopePlan:partial.data.scopePlan,proposalCopy:partial.data.proposalCopy}},gapCompletion);
     return await finish(continuationAudit(brief,{synthesis:updated,reason}),gapCompletion);
    }
    return await finish(await restoreContinuation(brief,partial,ledger,now()),gapCompletion);
   }
   const stoppedIndex=rows.findIndex(step=>step?.state!=='complete');
   if(['start','status'].includes(action)&&stoppedIndex>=0&&canContinue(rows[stoppedIndex],now())){
    const chosen=await ledger.get('audit:continuation:v1:'+pendingPhases[stoppedIndex]+':'+hash);
    if(chosen?.state==='complete')return await finish(await restoreContinuation(brief,chosen.value,ledger,now()));
   }
   if(action==='continue'){
    const index=rows.findIndex(step=>step?.state!=='complete');
    if(index>=0){
     phase=pendingPhases[index];const stopped=rows[index];
     if(!canContinue(stopped,now()))throw new BudgetError('continuation_unavailable','Yalnız durmuş bir araştırmadan mevcut bilgilerle devam edilebilir.');
     const reason=abandonedStage(stopped,now())?'stage_abandoned':stopped.value.code;
     const completeSynthesis=rows[pendingPhases.indexOf('synthesis')];
     const audit=await ledger.once('audit:continuation:v1:'+phase+':'+hash,{briefHash:hash,phase},0,async()=>continuationAudit(brief,{synthesis:completeSynthesis?.state==='complete'?completeSynthesis.value:undefined,reason}));
     log('bhs_explicit_continuation',{reason,additionalPaidCalls:0});return await finish(await restoreContinuation(brief,audit,ledger,now()));
    }
   }
   for(const [index,name] of pendingPhases.entries()){
    const step=rows[index];
    if(step?.state==='complete')continue;
    phase=name;log('bhs_phase',{tariffVersion:tariff.version});
    if(action==='recover'){
     if(step?.state!=='uncertain'||step.charge_kurus!==0||!recoverableAuditCodes.has(step.value?.code))throw new BudgetError('recovery_unavailable','Yalnızca durmuş bir araştırma aşaması yeniden denenebilir.');
     const marker=recoveryKey(brief,phase),prior=await ledger.get(marker);
     if(prior)throw new BudgetError('recovery_exhausted','Bu aşamanın ek denemesi zaten kullanıldı. Kayıtlar ve maliyet sınırı korundu.');
     if((await cost()).chargedKurus>=tariff.capKurus)throw new BudgetError('budget_limit','Kartın toplam maliyet sınırına ulaşıldı; yeniden deneme başlatılmadı.');
     await ledger.once(marker,{briefHash:hash,phase,round:1},0,async()=>({round:1,approvedAt:now()}));
     job.recoveryApprovedFor=phase;
     log('bhs_manual_recovery',{round:1});
     return res.status(202).json({phase,status:'in_progress',nextAction:'advance',ticket:codec.encode(job,session,host),cost:await cost()});
    }
    if(step?.state==='uncertain'&&step.charge_kurus!==0)throw new BudgetError('budget_uncertain','Önceki aşama tamamlanamadı; kayıt ve ayrılmış maliyet korunuyor. Yeni ücretli çağrı başlatılmadı.');
    if(abandonedStage(step,now()))throw new BudgetError('stage_abandoned','Önceki araştırma işlemi tamamlanamadı. Kayıt ve ayrılmış tutar korunuyor; mevcut bilgilerle teklif hazırlamaya devam edebilirsin.');
    if(step?.state==='reserved')return res.status(200).json({phase,status:'in_progress',ticket,cost:await cost()});
    const manualRecoveryRound=recoveryRound(await ledger.get(recoveryKey(brief,phase)),{briefHash:hash,phase});
    if(step?.state==='uncertain'&&step.charge_kurus===0&&canContinue(step,now())){
     // Do not reconstruct and replay a failed paid request after code/prompt
     // changes. Only a newly signed explicit recovery can run the next batch.
     const failedRound=step.value?.recoveryRound??(manualRecoveryRound&&job.recoveryApprovedFor!==phase?1:0);
     if(manualRecoveryRound<=failedRound)throw new BudgetError(step.value.code,'Bu aşama önceki denemede tamamlanamadı. Kayıtlar ve maliyetler korundu; yeniden deneme veya mevcut bilgilerle devam et seçeneklerini kullanabilirsin.');
    }
    if(action!=='advance')return res.status(200).json({phase,status:'in_progress',nextAction:'advance',ticket,cost:await cost()});
    const budget=researchVersion==='v8'?await managedPhaseBudget({ledger,brief,phase,existingBrandPlan:step}):{ledger};
    const providers=getProviders({ledger:budget.ledger,manualRecoveryRound,researchVersion,phase,managedAudit:budget.managedAudit,managedBudgetVersion:budget.managedBudgetVersion,phaseLimitKurus:budget.phaseCeiling});
    if(!providers.configured())throw new BudgetError('not_configured','Bütçeli araştırma için Tavily ve Gemini bağlantıları gerekli.');
    const stageStarted=now();
    await runStage({phase,brief,ledger:budget.ledger,providers,researchVersion,researchModel:job.researchModel||'gemini-3.1-pro-preview',...(job.researchRunId?{freshResearch:true}:{})});
    log('bhs_response',{status:'stage_complete',durationMs:now()-stageStarted,cost:await cost()});
    const nextPhase=activePhases[activePhases.indexOf(phase)+1];
    if(nextPhase!=='complete')return res.status(202).json({phase:nextPhase,status:'in_progress',nextAction:'advance',ticket,cost:await cost()});
    break;
   }
   let synthesis=(await ledger.get(key('synthesis'))).value;
   const scope=(await ledger.get(key('scope'))).value;
   let audit=await auditEngine.run({brief,synthesis});
   const {updated,gapCompletion}=await finishGaps(synthesis,audit);
   if(updated){synthesis=updated;audit=await auditEngine.run({brief,synthesis});}
   if(!hasGroundedResearch(audit.data)&&synthesis.supervision?.reviewMode!=='managed-audit')
    return await finish(await restoreContinuation(brief,continuationAudit(brief,{reason:'research_empty'}),ledger,now()));
   // Re-grounding an older paid report can remove a finding used by its saved
   // scope. Revalidate before signing; never replay research or sign stale IDs.
   let scopePlan,proposalCopy=scope.proposalCopy;
   try{scopePlan=validateScope(scope.scopePlan,brief,audit.data);}
   catch{scopePlan=fallbackScope(brief);proposalCopy=offerCopy(null,audit.data);}
   const final={...audit,data:{...audit.data,scopePlan,proposalCopy}};
   if((backgroundJob||synthesis.supervision?.reviewMode==='managed-audit')&&audit.status!=='ready')
    return await finish(continuationAudit(brief,{verifiedAudit:final,reason:synthesis.supervision?.reportIssue||'quality_review'}),gapCompletion);
   return await finish(final,gapCompletion);
  }catch(error){
   if(phase==='website_check'&&temporaryDnsError(error)){
    log('bhs_error',{code:error.code,errorName:error.name,networkOperation:error.syscall||'dns_lookup',retryable:true});
    return res.status(503).json({code:'website_network_busy',error:'Site adresinin ağ kontrolü geçici olarak meşgul. Ücretli BHS başlatılmadı; aynı karttan tekrar deneyebilirsin.'});
   }
   const code=error.code||'invalid_report',internalDetail=/^(Test|Kanıt|Marka|En az|sourcePlan|Invalid URL|Cannot |The operation|fetch failed)/.test(error.message||'')?error.message.slice(0,180):undefined;log('bhs_error',{code,errorName:error.name,...(internalDetail?{validationDetail:internalDetail}:{}),...(error.providerStatus?{providerStatus:error.providerStatus,providerReason:error.providerReason,parameterHints:error.parameterHints,providerOperation:error.providerOperation}:{})});
   if(error.budgetDiagnostic)log('bhs_budget_preflight',error.budgetDiagnostic);
   if(error.modelAttempts)log('bhs_model_attempts',{attempts:error.modelAttempts});
   if(code==='budget_pending')return res.status(202).json({phase,status:'in_progress',ticket:recoveryTicket});
   let cost;try{if(readCost)cost=await readCost();}catch{/* Preserve the original failure if cost status is unavailable. */}
   let recoveryAvailable=false,continuationAvailable=false;
   if(['start','advance','status'].includes(action)&&recoveryTicket&&activeLedger){
    try{
     const failed=await activeLedger.get(stageKey(activeBrief,phase,activeResearchVersion,activeCheckpointHash));
     continuationAvailable=canContinue(failed,now());
     recoveryAvailable=recoverableAuditCodes.has(code)&&cost?.chargedKurus<cost?.capKurus&&failed?.state==='uncertain'&&failed.charge_kurus===0&&recoverableAuditCodes.has(failed.value?.code)&&!await activeLedger.get(recoveryKey(activeBrief,phase));
    }catch{}
   }
   return res.status(code==='not_configured'?503:422).json({code,error:error instanceof BudgetError?error.message:'BHS verileri doğrulanamadı. Yeni araştırma otomatik başlatılmadı.',...(cost?{cost}:{}),...(error.budgetDiagnostic?{budgetDetail:error.budgetDiagnostic}:{}),...(recoveryAvailable||continuationAvailable?{ticket:recoveryTicket}:{}),...(recoveryAvailable?{recoveryAvailable:true}:{}),...(continuationAvailable?{continuationAvailable:true}:{})});
  }
 };
}
