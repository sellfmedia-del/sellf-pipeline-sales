import {hasGroundedResearch} from './research-content.mjs';
import {offersEnabled} from '../runtime.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash,validatePublicBrief} from './brief.mjs';
import {createPricingProof,digest} from '../pricing/proof.mjs';
import {budgetFor,tariff,tariffReadiness,BudgetError} from '../budget/ledger.mjs';
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

export function createBoundedAuditHandler({getLedger=budgetFor,getProviders=options=>createBoundedProviders(options),getSecret=offerGeminiKey,getResearchModel=()=>process.env.OFFER_BHS_PRIMARY_MODEL||'gemini-2.5-pro',getResearchVersion=()=> 'v6',validateWebsite=validatePublicBrief,runStage=options=>auditEngine.runStage(options),getSourceOffer=(req,id)=>runtimeStore().detail(bearer(req),id),now=Date.now,logger=console}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'BHS yalnızca test önizlemesinde açık.'});
  if(req.method==='GET')return res.status(200).json({configured:Boolean(getSecret()&&(process.env.OFFER_TAVILY_API_KEY||process.env.TAVILY_API_KEY)&&process.env.OFFER_STORAGE_GATEWAY_KEY),provider:'Tavily + Gemini Pro',costCapTry:50,costLedger:'durable-per-lead',primaryModel:getResearchModel(),modelTransport:process.env.OFFER_MODEL_TRANSPORT||'google',tariffVersion:tariff.version,tariffReadiness:tariffReadiness(now()),qualityBenchmark:'not_requested',contentReview:false});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  const requestId=/^[a-zA-Z0-9_-]{16,80}$/.test(req.headers['x-offer-request-id']||'')?req.headers['x-offer-request-id']:randomUUID();res.setHeader('X-Offer-Request-Id',requestId);
  let phase='unknown',action='unknown',readCost,recoveryTicket,activeLedger,activeBrief,activeResearchVersion;
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
   if(job.researchModel&&!['gemini-2.5-pro','gemini-3.1-pro-preview','gemini-4-argon'].includes(job.researchModel))throw new BudgetError('model_budget','BHS için onaylı üst model gerekli.');
   const researchVersion=job.researchVersion||'v3';if(!['v3','v4','v5','v6'].includes(researchVersion))throw new BudgetError('invalid_job','Araştırma sürümü geçersiz.');activeResearchVersion=researchVersion;
   const key=name=>stageKey(brief,name,researchVersion);
   const ledger=await getLedger(req,res,job.leadId,...(job.researchRunId?[{researchRunId:job.researchRunId}]:[]));activeLedger=ledger;activeBrief=brief;
   if(action==='start'){
    phase='website_check';await validateWebsite(brief);phase='budget_init';await ledger.begin();
    if(!session){session=randomBytes(32).toString('base64url');const existing=res.getHeader?.('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:existing?[existing]:[]),'__Host-offer-research='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200']);}
   }
   // Display baseline only: never reset the durable ledger or its reservations.
   if(action==='start')job.attemptStartKurus=(await ledger.status()).chargedKurus;
   const ticket=codec.encode(job,session,host),cost=async()=>{
    const total=await ledger.status();
    const breakdown=ledger.describe?.(total);
    return {...total,...(breakdown?{breakdown}:{}),...(Number.isSafeInteger(job.attemptStartKurus)?{attemptChargedKurus:Math.max(0,total.chargedKurus-job.attemptStartKurus)}:{})};
   };readCost=cost;recoveryTicket=ticket;
   if(action==='cancel')return res.status(200).json({status:'cancelled',cost:await cost()});
   if(action==='preflight'){
    const providers=getProviders({ledger});
    const probe=await providers.generate('provider_preflight',{instruction:'Return the JSON object with ok=true. No additional text.'},{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},{model:'gemini-4-argon',maxOutputTokens:1024,thinkingLevel:'LOW'});
    log('bhs_provider_preflight',{model:probe.model,ok:probe.data?.ok===true,cost:await cost()});return res.status(200).json({ok:probe.data?.ok===true,cost:await cost()});
   }
   if(!['start','status','advance','recover','continue'].includes(action))throw Error();
   const pendingPhases=phases.filter(x=>x!=='complete');
   const rows=await Promise.all(pendingPhases.map(name=>ledger.get(key(name))));
   const finish=async final=>{
    const result={...final,stage:'audit',engineVersion:'direct-bhs-pro-'+researchVersion,inputHash:hash,runId:digest({leadId:job.leadId,hash}),cost:await cost()};
    const pricingProof=result.status==='ready'?codec.encode({kind:'audit_ready',createdAt:now(),briefHash:hash,auditHash:digest(result),budgetLeadId:job.leadId,...(job.researchRunId?{budgetResearchRunId:job.researchRunId}:{}),...(job.sourceOfferId?{sourceOfferId:job.sourceOfferId,auditOrigin:{briefHash:hash,researchRunId:job.researchRunId}}:{})},session,host):null;
    log('bhs_response',{phase:'complete',status:result.status,cost:result.cost,continuity:result.data.researchContinuity?.status||null});return res.status(200).json({phase:'complete',result,pricingProof,cost:result.cost});
   };
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
    const providers=getProviders({ledger,manualRecoveryRound});
    if(!providers.configured())throw new BudgetError('not_configured','Bütçeli araştırma için Tavily ve Gemini bağlantıları gerekli.');
    const stageStarted=now();
    await runStage({phase,brief,ledger,providers,researchVersion,researchModel:job.researchModel||'gemini-3.1-pro-preview',...(job.researchRunId?{freshResearch:true}:{})});
    log('bhs_response',{status:'stage_complete',durationMs:now()-stageStarted,cost:await cost()});
    const nextPhase=phases[phases.indexOf(phase)+1];
    if(nextPhase!=='complete')return res.status(202).json({phase:nextPhase,status:'in_progress',nextAction:'advance',ticket,cost:await cost()});
    break;
   }
   const synthesis=(await ledger.get(key('synthesis'))).value,scope=(await ledger.get(key('scope'))).value;
   let audit=await auditEngine.run({brief,synthesis});
   if(!hasGroundedResearch(audit.data))return await finish(await restoreContinuation(brief,continuationAudit(brief,{reason:'research_empty'}),ledger,now()));
   // Re-grounding an older paid report can remove a finding used by its saved
   // scope. Revalidate before signing; never replay research or sign stale IDs.
   let scopePlan,proposalCopy=scope.proposalCopy;
   try{scopePlan=validateScope(scope.scopePlan,brief,audit.data);}
   catch{scopePlan=fallbackScope(brief);proposalCopy=offerCopy(null,audit.data);}
   const final={...audit,data:{...audit.data,scopePlan,proposalCopy}};
   return await finish(final);
  }catch(error){
   if(phase==='website_check'&&temporaryDnsError(error)){
    log('bhs_error',{code:error.code,errorName:error.name,networkOperation:error.syscall||'dns_lookup',retryable:true});
    return res.status(503).json({code:'website_network_busy',error:'Site adresinin ağ kontrolü geçici olarak meşgul. Ücretli BHS başlatılmadı; aynı karttan tekrar deneyebilirsin.'});
   }
   const code=error.code||'invalid_report',internalDetail=/^(Test|Kanıt|Marka|En az|sourcePlan|Invalid URL|Cannot |The operation|fetch failed)/.test(error.message||'')?error.message.slice(0,180):undefined;log('bhs_error',{code,errorName:error.name,...(internalDetail?{validationDetail:internalDetail}:{}),...(error.providerStatus?{providerStatus:error.providerStatus,providerReason:error.providerReason,parameterHints:error.parameterHints,providerOperation:error.providerOperation}:{})});
   if(error.budgetDiagnostic)log('bhs_budget_preflight',error.budgetDiagnostic);
   if(error.modelAttempts)log('bhs_model_attempts',{attempts:error.modelAttempts});
   if(code==='budget_pending')return res.status(202).json({phase,status:'in_progress',ticket:typeof req.body==='object'?req.body.ticket:undefined});
   let cost;try{if(readCost)cost=await readCost();}catch{/* Preserve the original failure if cost status is unavailable. */}
   let recoveryAvailable=false,continuationAvailable=false;
   if(['start','advance','status'].includes(action)&&recoveryTicket&&activeLedger){
    try{
     const failed=await activeLedger.get(stageKey(activeBrief,phase,activeResearchVersion));
     continuationAvailable=canContinue(failed,now());
     recoveryAvailable=recoverableAuditCodes.has(code)&&cost?.chargedKurus<cost?.capKurus&&failed?.state==='uncertain'&&failed.charge_kurus===0&&recoverableAuditCodes.has(failed.value?.code)&&!await activeLedger.get(recoveryKey(activeBrief,phase));
    }catch{}
   }
   return res.status(code==='not_configured'?503:422).json({code,error:error instanceof BudgetError?error.message:'BHS verileri doğrulanamadı. Yeni araştırma otomatik başlatılmadı.',...(cost?{cost}:{}),...(error.budgetDiagnostic?{budgetDetail:error.budgetDiagnostic}:{}),...(recoveryAvailable||continuationAvailable?{ticket:recoveryTicket}:{}),...(recoveryAvailable?{recoveryAvailable:true}:{}),...(continuationAvailable?{continuationAvailable:true}:{})});
  }
 };
}
