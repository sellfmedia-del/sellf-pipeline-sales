import {applyEdits} from '../src/bhs/editor.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash,validatePublicBrief} from '../src/bhs/brief.mjs';
import {createResearchProvider,ResearchError,interactionFailure} from '../src/bhs/provider.mjs';
import {createTicketCodec} from '../src/bhs/ticket.mjs';
import {discoverySourceHints} from '../src/bhs/discovery-hints.mjs';
import {createEvidenceCollector,assertCoreEvidence} from '../src/bhs/evidence.mjs';
import {parseSourcePlan} from '../src/bhs/source-plan.mjs';
import {readStoredEnvelope,parseGroundedReport} from '../src/bhs/grounded-report.mjs';
import {modelText} from '../src/bhs/provider.mjs';
import {createAuditEngine} from '../src/engines/audit-engine.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';

export function createAuditHandler({getProvider=()=>createResearchProvider(),getSecret=()=>process.env.OFFER_GEMINI_API_KEY,validateWebsite=validatePublicBrief,engine=createAuditEngine(),collect=createEvidenceCollector(),now=Date.now,logger=console}={}){
  // Best-effort per-instance dedupe only; no database or durable store is used.
  // Browsers never auto-retry a paid start after an ambiguous response.
  const starts=new Map();
  return async function handler(req,res){
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'BHS servisi yalnızca korumalı önizlemede açık.'});
    const provider=getProvider();
    if(req.method==='GET')return res.status(200).json({configured:provider.configured(),provider:'Gemini Deep Research',verification:'evidence-and-semantic-checks',benchmark:'pending'});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Bu işlem POST isteği gerektirir.'});}
    const host=req.headers.host;
    if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
    if(!provider.configured())return res.status(503).json({code:'not_configured',error:'BHS araştırma bağlantısı henüz tanımlı değil.'});
    const trace={event:'bhs_request',requestId:/^[a-zA-Z0-9_-]{16,80}$/.test(req.headers['x-offer-request-id']||'')?req.headers['x-offer-request-id']:randomUUID(),action:'unknown',phase:'unknown'},receivedAt=now();
    const writeLog=(event,extra={})=>{try{logger.info(JSON.stringify({...trace,event,...extra}));}catch{/* Logging must not break research. */}};
    const sendJson=res.json.bind(res);
    res.setHeader('X-Offer-Request-Id',trace.requestId);
    res.json=value=>{
      writeLog('bhs_response',{durationMs:now()-receivedAt,...(value.code?{code:value.code}:{}),...(value.phase?{phase:value.phase}:{}),...(value.status?{status:value.status}:{}),...(value.result?{resultStatus:value.result.status}:{})});
      return sendJson(value);
    };
    writeLog('bhs_request_received');
    try{
      if((Number(req.headers['content-length'])||0)>90000)throw new ResearchError('invalid_brief','Brief boyut sınırını aşıyor.');
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      if(!body||JSON.stringify(body).length>90000)throw new ResearchError('invalid_brief','Brief boyut sınırını aşıyor.');
      trace.action=['start','status','advance','structure','cancel'].includes(body.action)?body.action:'invalid';
      writeLog('bhs_action');
      const brief=snapshotBrief(body.brief),hash=briefHash(brief),codec=createTicketCodec(getSecret());
      let session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
      if(!session){
        if(body.action!=='start')throw new ResearchError('invalid_job','Araştırma oturumu bulunamadı.');
        session=randomBytes(32).toString('base64url');
        res.setHeader('Set-Cookie','__Host-offer-research='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200');
      }
      for(const [key,item]of starts)if(now()-item.time>7200000)starts.delete(key);
      const ticket=value=>codec.encode(value,session,host);
      async function once(key,run){
        if(starts.has(key))return starts.get(key).promise;
        if(starts.size>200)throw new ResearchError('busy','Araştırma servisi meşgul.');
        const promise=run();starts.set(key,{time:now(),promise});
        // Keep rejected promises too. Do not retry a potentially billable POST.
        return promise;
      }
      if(body.action==='start'){
        if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId))throw new ResearchError('invalid_job','İstek kimliği geçersiz.');
        await validateWebsite(brief);
        const job=await once(session+':'+body.requestId+':'+hash,async()=>{
          const value=await provider.start(brief,new Date(now()).toISOString().slice(0,10));
          return {phase:'research',hash,researchId:value.id,startedAt:now(),runId:randomUUID()};
        });
        return res.status(202).json({phase:'research',ticket:ticket(job),status:'in_progress'});
      }
      const job=codec.decode(body.ticket,session,host,now());
      trace.phase=job.phase;trace.runId=job.runId;
      writeLog('bhs_phase');
      if(job.hash!==hash)throw new ResearchError('changed_brief','Brief değişti. Önceki araştırma bu bilgiler için kullanılamaz.');
      const field={research:'researchId',source_plan:'sourcePlanId',synthesis:'synthesisId',semantic:'semanticId',revision:'revisionId',structure:'structureId'}[job.phase];
      const id=job[field];
      if(body.action==='cancel'){
        await provider.cancel(id);return res.status(200).json({status:'cancelled'});
      }
      if(!['status','advance','structure'].includes(body.action))throw new ResearchError('invalid_job','Araştırma işlemi geçersiz.');
      const interaction=await provider.poll(id,{includeInput:['synthesis','revision','semantic'].includes(job.phase)});
      if(['queued','in_progress'].includes(interaction.status))return res.status(200).json({phase:job.phase,status:'in_progress',ticket:body.ticket});
      if(interaction.status!=='completed')throw interactionFailure(interaction);
      if(['research','source_plan','synthesis','revision'].includes(job.phase)){
        if(body.action==='status')return res.status(200).json({phase:job.phase+'_complete',status:'in_progress',nextAction:'advance',ticket:body.ticket});
        const next=await once(session+':advance:'+job.phase+':'+id,async()=>{
          if(job.phase==='research'){
            const value=await provider.discoverSources(brief,interaction);
            return {...job,phase:'source_plan',sourcePlanId:value.id};
          }
          if(job.phase==='source_plan'){
            const plan=parseSourcePlan(JSON.parse(modelText(interaction)));
            const research=await provider.poll(job.researchId);
            const packet=await collect(brief,plan,{extraSources:discoverySourceHints(research,brief)});
            try{assertCoreEvidence(packet,brief);}catch(error){throw new ResearchError('insufficient_sources',error.message+' BHS metni üretilmedi.');}
            const value=await provider.synthesize(brief,packet);
            return {...job,phase:'synthesis',synthesisId:value.id};
          }
          if(job.phase==='synthesis'){
            const envelope=readStoredEnvelope(interaction,'sellf-bhs-synthesis-v1',brief);
            const report=parseGroundedReport(modelText(interaction));
            const value=await provider.revise(brief,envelope.packet,report);
            return {...job,phase:'revision',revisionId:value.id};
          }
          const envelope=readStoredEnvelope(interaction,'sellf-bhs-editor-v1',brief);
          const report=applyEdits(envelope.report,JSON.parse(modelText(interaction)));
          const value=await provider.assess(brief,envelope.packet,report);
          return {...job,phase:'semantic',semanticId:value.id};
        });
        return res.status(202).json({phase:next.phase,status:'in_progress',ticket:ticket(next)});
      }
      if(body.action!=='status')throw new ResearchError('invalid_job','Araştırma aşaması geçersiz.');
      let result;
      if(job.phase==='structure'){
        const research=await provider.poll(job.researchId);
        result=await engine.run({brief,research,structure:interaction});
      }else{
        const envelope=readStoredEnvelope(interaction,'sellf-bhs-semantic-v1',brief);
        result=await engine.run({brief,packet:envelope.packet,report:envelope.report,assessment:JSON.parse(modelText(interaction)),researchId:job.researchId,synthesisId:job.synthesisId,semanticId:job.semanticId,revisionId:job.revisionId,usage:{semantic:interaction.usage||null}});
      }
      const auditResult={...result,stage:'audit',engineVersion:engine.version,inputHash:hash,runId:job.runId};
      const pricingProof=result.status==='ready'?createPricingProof(getSecret()).encode({kind:'audit_ready',createdAt:now(),briefHash:hash,auditHash:digest(auditResult)},session,host):null;
      return res.status(200).json({phase:'complete',result:auditResult,pricingProof});
    }catch(error){
      const code=error instanceof ResearchError?error.code:'invalid_report';
      const message=error instanceof ResearchError?error.message:'BHS bilgileri doğrulanamadı. Sonuç teklif için kullanılmadı.';
      return res.status(code==='not_configured'?503:code==='quota'||code==='busy'?429:422).json({code,error:message});
    }
  };
}
export default createAuditHandler();
