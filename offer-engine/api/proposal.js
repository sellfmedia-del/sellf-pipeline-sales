import {quoteCurrency} from '../src/pricing/currency.mjs';
import {offersEnabled,authorizeProduction} from '../src/runtime.mjs';
import {randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {interactionId,modelText} from '../src/bhs/provider.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {normalizePlan,compositionHash} from '../src/proposal/composition.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {assertResult} from '../src/contracts.mjs';
import {offerGeminiKey} from '../src/config.mjs';
export function createProposalHandler({getProvider=null,getSecret=offerGeminiKey,now=Date.now}={}){
 const starts=new Map();
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'Teklif servisi yalnızca korumalı önizlemede açık.'});
  if(req.method==='GET')return res.status(200).json({configured:Boolean(getSecret()),provider:'Gemini',pricesFrom:'pricing-engine',logoFrom:'logo-engine',customerAlternatives:2});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
    await authorizeProduction(req);
   if(Number(req.headers['content-length'])>4200000)throw Error();
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||JSON.stringify(body).length>4200000)throw Error();
   const brief=snapshotBrief(body.brief),hash=briefHash(brief),secret=getSecret(),codec=createPricingProof(secret);
   const session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!session)throw Error();
   const approval=codec.decode(body.proposalProof,session,host,now());
   if(approval.kind!=='pricing_ready'||approval.briefHash!==hash||approval.auditHash!==digest(body.audit)||approval.pricingHash!==digest(body.pricing))throw Error();
   assertResult('audit',body.audit);assertResult('pricing',body.pricing);
   if(quoteCurrency(body.brief?.currency)!==(body.pricing.data.quote?.currency||'TRY'))throw Error('Teklif para birimi fiyat kaydıyla eşleşmiyor.');
   const {logoProof:receipt,...logoData}=body.logo||{};logoProof(secret,host,logoData,receipt);
   const logo={stage:'logo',status:'review',data:logoData};assertResult('logo',logo);
   const context={leadId:body.context?.leadId,spaceId:body.context?.spaceId};
   if(Object.values(context).some(v=>typeof v!=='string'||!v||v.length>200))throw Error();
   const plan=normalizePlan(body),inputHash=compositionHash(brief,body.audit,body.pricing,logo,{...plan,context,logoBackground:body.logoBackground});
   const claims={...context,briefHash:hash,auditHash:approval.auditHash,pricingHash:approval.pricingHash,inputHash,...(approval.sourceOfferId?{sourceOfferId:approval.sourceOfferId}:{})};
   if(!getProvider){
    if(!approval.budgetLeadId||approval.budgetLeadId!==context.leadId||body.action!=='start')throw Error();
    const result=await proposalEngine.run({brief,copy:body.audit.data.proposalCopy,planMode:plan.mode,manualSteps:plan.manualSteps,logoBackground:body.logoBackground,now:now()},{audit:body.audit,pricing:body.pricing,logo});
    const envelope={...result,stage:'proposal',engineVersion:proposalEngine.version,inputHash,runId:randomUUID()};assertResult('proposal',envelope);
    return res.status(200).json({phase:'complete',result:envelope,saveProof:codec.encode({kind:'proposal_ready',createdAt:now(),...claims,proposalHash:digest(envelope)},session,host)});
   }
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
   const result=await proposalEngine.run({brief,copy:JSON.parse(modelText(job)),planMode:plan.mode,manualSteps:plan.manualSteps,logoBackground:body.logoBackground,now:now()},{audit:body.audit,pricing:body.pricing,logo});
   const envelope={...result,stage:'proposal',engineVersion:proposalEngine.version,inputHash,runId:randomUUID()};assertResult('proposal',envelope);
   return res.status(200).json({phase:'complete',result:envelope,saveProof:codec.encode({kind:'proposal_ready',createdAt:now(),...claims,proposalHash:digest(envelope)},session,host)});
  }catch{return res.status(422).json({error:'Teklif oluşturulamadı. Doğrulanmış brief, logo ve fiyat kaydını kontrol et. Yeni Gemini çağrısı otomatik başlatılmadı.'});}
 };
}
export default createProposalHandler();
