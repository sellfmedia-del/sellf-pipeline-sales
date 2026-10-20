import {randomBytes,randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash,validatePublicBrief} from './brief.mjs';
import {createPricingProof,digest} from '../pricing/proof.mjs';
import {budgetFor,tariff,BudgetError} from '../budget/ledger.mjs';
import {createBoundedProviders} from '../budget/providers.mjs';
import {phases,stageKey,runBoundedStage} from './bounded-research.mjs';

export function createBoundedAuditHandler({getLedger=budgetFor,getProviders=options=>createBoundedProviders(options),getSecret=()=>process.env.OFFER_GEMINI_API_KEY,validateWebsite=validatePublicBrief,runStage=runBoundedStage,now=Date.now,logger=console}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'BHS yalnızca test önizlemesinde açık.'});
  if(req.method==='GET')return res.status(200).json({configured:Boolean(getSecret()&&(process.env.OFFER_TAVILY_API_KEY||process.env.TAVILY_API_KEY)&&process.env.OFFER_STORAGE_GATEWAY_KEY),provider:'Tavily + Gemini Pro',costCapTry:50,costLedger:'durable-per-lead',tariffVersion:tariff.version,qualityBenchmark:'pending'});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  const requestId=/^[a-zA-Z0-9_-]{16,80}$/.test(req.headers['x-offer-request-id']||'')?req.headers['x-offer-request-id']:randomUUID();res.setHeader('X-Offer-Request-Id',requestId);
  let phase='unknown',action='unknown';
  const log=(event,extra={})=>{try{(event==='bhs_error'?logger.error:logger.info)?.call(logger,JSON.stringify({event,requestId,phase,action,...extra}));}catch{}};
  try{
   if(Number(req.headers['content-length'])>100000)throw new BudgetError('invalid_brief','Brief boyut sınırını aşıyor.');
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>100000)throw Error();
   const brief=snapshotBrief(body.brief),hash=briefHash(brief),codec=createPricingProof(getSecret());action=body.action;
   let session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1],job;
   if(action==='start'){
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(body.requestId||''))throw Error();
    job={kind:'bounded_audit',createdAt:now(),briefHash:hash,auditHash:hash,leadId:body.context?.leadId,spaceId:body.context?.spaceId};
   }else{
    if(!session)throw new BudgetError('invalid_job','Araştırma oturumu bulunamadı.');
    job=codec.decode(body.ticket,session,host,now());if(job.kind!=='bounded_audit'||job.briefHash!==hash)throw new BudgetError('changed_brief','Brief araştırma kaydıyla eşleşmiyor.');
   }
   const ledger=await getLedger(req,res,job.leadId),providers=getProviders({ledger});
   if(action==='start'){
    await validateWebsite(brief);await ledger.begin();
    if(!session){session=randomBytes(32).toString('base64url');const existing=res.getHeader?.('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:existing?[existing]:[]),'__Host-offer-research='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200']);}
   }
   const ticket=codec.encode(job,session,host),cost=()=>ledger.status();
   if(action==='cancel')return res.status(200).json({status:'cancelled',cost:await cost()});
   if(!['start','status','advance'].includes(action))throw Error();
   for(const name of phases.filter(x=>x!=='complete')){
    const step=await ledger.get(stageKey(brief,name));
    if(step?.state==='complete')continue;
    phase=name;log('bhs_phase',{tariffVersion:tariff.version});
    if(step?.state==='uncertain')throw new BudgetError('budget_uncertain','Önceki aşama tamamlanamadı; kayıt ve ayrılmış maliyet korunuyor. Yeni ücretli çağrı başlatılmadı.');
    if(step?.state==='reserved')return res.status(200).json({phase,status:'in_progress',ticket,cost:await cost()});
    if(action!=='advance')return res.status(200).json({phase,status:'in_progress',nextAction:'advance',ticket,cost:await cost()});
    if(!providers.configured())throw new BudgetError('not_configured','Bütçeli araştırma için Tavily ve Gemini bağlantıları gerekli.');
    await runStage({phase,brief,ledger,providers});
    log('bhs_response',{status:'stage_complete',cost:await cost()});
    return res.status(202).json({phase:phases[phases.indexOf(phase)+1],status:'in_progress',ticket,cost:await cost()});
   }
   const final=(await ledger.get(stageKey(brief,'semantic'))).value;
   const result={...final,stage:'audit',engineVersion:'bounded-evidence-pro-v1',inputHash:hash,runId:digest({leadId:job.leadId,hash}),cost:await cost()};
   const pricingProof=result.status==='ready'?codec.encode({kind:'audit_ready',createdAt:now(),briefHash:hash,auditHash:digest(result),budgetLeadId:job.leadId},session,host):null;
   log('bhs_response',{phase:'complete',status:result.status,cost:result.cost});return res.status(200).json({phase:'complete',result,pricingProof,cost:result.cost});
  }catch(error){
   const code=error.code||'invalid_report';log('bhs_error',{code,...(error.providerStatus?{providerStatus:error.providerStatus,providerReason:error.providerReason}:{})});
   if(code==='budget_pending')return res.status(202).json({phase,status:'in_progress',ticket:typeof req.body==='object'?req.body.ticket:undefined});
   return res.status(code==='not_configured'?503:422).json({code,error:error instanceof BudgetError?error.message:'BHS verileri doğrulanamadı. Yeni araştırma otomatik başlatılmadı.'});
  }
 };
}
