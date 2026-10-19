import {randomBytes,randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash,validatePublicBrief} from '../src/bhs/brief.mjs';
import {createResearchProvider,ResearchError} from '../src/bhs/provider.mjs';
import {createTicketCodec} from '../src/bhs/ticket.mjs';
import {createAuditEngine} from '../src/engines/audit-engine.mjs';

export function createAuditHandler({getProvider=()=>createResearchProvider(),getSecret=()=>process.env.OFFER_GEMINI_API_KEY,validateWebsite=validatePublicBrief,engine=createAuditEngine(),now=Date.now}={}){
  // Best-effort per-instance dedupe only; no database or durable store is used.
  // Browsers never auto-retry a paid start after an ambiguous response.
  const starts=new Map();
  return async function handler(req,res){
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'BHS servisi yalnızca korumalı önizlemede açık.'});
    const provider=getProvider();
    if(req.method==='GET')return res.status(200).json({configured:provider.configured(),provider:'Gemini Deep Research',benchmark:'pending'});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Bu işlem POST isteği gerektirir.'});}
    const host=req.headers.host;
    if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
    if(!provider.configured())return res.status(503).json({code:'not_configured',error:'BHS araştırma bağlantısı henüz tanımlı değil.'});
    try{
      if((Number(req.headers['content-length'])||0)>90000)throw new ResearchError('invalid_brief','Brief boyut sınırını aşıyor.');
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      if(!body||JSON.stringify(body).length>90000)throw new ResearchError('invalid_brief','Brief boyut sınırını aşıyor.');
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
      if(job.hash!==hash)throw new ResearchError('changed_brief','Brief değişti. Önceki araştırma bu bilgiler için kullanılamaz.');
      const id=job.phase==='research'?job.researchId:job.structureId;
      if(body.action==='cancel'){
        await provider.cancel(id);return res.status(200).json({status:'cancelled'});
      }
      if(!['status','structure'].includes(body.action))throw new ResearchError('invalid_job','Araştırma işlemi geçersiz.');
      const interaction=await provider.poll(id);
      if(['queued','in_progress'].includes(interaction.status))return res.status(200).json({phase:job.phase,status:'in_progress',ticket:body.ticket});
      if(interaction.status!=='completed')throw new ResearchError('research_failed','Araştırma tamamlanamadı veya eksik kaldı. Sonuç teklif için kullanılmadı.');
      if(job.phase==='research'){
        if(body.action==='status')return res.status(200).json({phase:'research_complete',status:'in_progress',ticket:body.ticket});
        const next=await once(session+':structure:'+job.researchId,async()=>{
          const value=await provider.structure(brief,job.researchId);
          return {...job,phase:'structure',structureId:value.id};
        });
        return res.status(202).json({phase:'structure',status:'in_progress',ticket:ticket(next)});
      }
      if(body.action!=='status')throw new ResearchError('invalid_job','Araştırma aşaması geçersiz.');
      const research=await provider.poll(job.researchId);
      const result=await engine.run({brief,research,structure:interaction});
      return res.status(200).json({phase:'complete',result:{...result,stage:'audit',engineVersion:engine.version,inputHash:hash,runId:job.runId}});
    }catch(error){
      const code=error instanceof ResearchError?error.code:'invalid_report';
      const message=error instanceof ResearchError?error.message:'BHS bilgileri doğrulanamadı. Sonuç teklif için kullanılmadı.';
      return res.status(code==='not_configured'?503:code==='quota'||code==='busy'?429:422).json({code,error:message});
    }
  };
}
export default createAuditHandler();
