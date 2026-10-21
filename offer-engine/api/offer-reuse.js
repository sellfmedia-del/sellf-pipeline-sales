import {randomBytes} from 'node:crypto';
import {offersEnabled,runtimeStore,bearer} from '../src/runtime.mjs';
import {budgetFor} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {offerGeminiKey} from '../src/config.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
const uuid=/^[a-f0-9-]{36}$/;
export function savedLogo(document,secret,host){
 if(document?.logo?.reviewed!==true||!document.logo.image?.startsWith('data:image/png;base64,'))return null;
 // This image was already accepted by the signed proposal/save boundary and
 // visually approved. Re-attest the saved bytes; do not process or invent pixels.
 const data={generated:false,reviewed:true,sourceType:'saved',candidates:[{id:'saved',image:document.logo.image,source:document.logo.image,placement:{background:document.logo.background,area:'logo-only'},quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]};
 return {...data,logoProof:logoProof(secret,host,data)};
}
export async function loadSavedSynthesis(row,ledger){
 const origin=row.pricing_snapshot?.auditOrigin||{briefHash:row.customer_document?.provenance?.briefHash};
 if(!/^[a-f0-9]{64}$/.test(origin.briefHash||''))throw Error('Kaydedilen BHS dayanağı bulunamadı.');
 for(const version of ['synthesis-v5:','synthesis-v4:','report-v3:']){
  const step=await ledger.get('audit:synthesis:'+version+origin.briefHash);
  if(step?.state==='complete'&&step.value?.report)return {origin,synthesis:{...structuredClone(step.value),reuse:{sourceOfferId:row.id,researchedAt:step.created_at||row.created_at,originalBriefHash:origin.briefHash,exactBrief:false,contextNeedsConfirmation:true,incrementalResearchCalls:0}}};
 }
 throw Error('Bu teklifin saklanan BHS raporuna ulaşılamadı. Yeni ücretli analiz otomatik başlatılmadı.');
}
export function createReuseHandler({getStore=runtimeStore,getLedger=budgetFor,getProviders=createBoundedProviders,getSecret=offerGeminiKey,runStage=runBoundedStage,now=Date.now}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'Teklif servisi etkin değil.'});
  const host=req.headers.host;if(req.method!=='POST'||!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
   if(Number(req.headers['content-length'])>100000)throw Error('Brief boyutu sınırı aşıldı.');
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!b||JSON.stringify(b).length>100000||!uuid.test(b.sourceOfferId||''))throw Error('Teklif kaydı geçersiz.');
   const jwt=bearer(req);if(!jwt)throw Error('Pipeline oturumu gerekli.');
   const row=await getStore().detail(jwt,b.sourceOfferId);
   if(row.lead_id!==b.context?.leadId||row.space_id!==b.context?.spaceId)throw Error('Teklif farklı karta ait.');
   if(b.action==='info')return res.status(200).json({brand:row.customer_document.brand,segment:row.pricing_snapshot.segment||row.pricing_snapshot.offerBrief?.segment,currency:row.customer_document.quote?.currency||'TRY',logo:savedLogo(row.customer_document,getSecret(),host)});
   if(b.action!=='prepare'||!uuid.test(b.researchRunId||''))throw Error('Teklif işlemi geçersiz.');
   const brief=snapshotBrief(b.brief),origin=row.pricing_snapshot?.auditOrigin;
   const sourceLedger=await getLedger(req,res,row.lead_id,origin?.researchRunId?{researchRunId:origin.researchRunId}:{});
   const saved=await loadSavedSynthesis(row,sourceLedger);
   const ledger=await getLedger(req,res,row.lead_id,{researchRunId:b.researchRunId});await ledger.begin();
   // Only commercial scope/copy can call a model. The synthesis comes from the
   // selected owner's saved research, including its original date and market.
   const key=stageKey(brief,'synthesis','v5'),scopeLedger={...ledger,get:name=>name===key?Promise.resolve({state:'complete',value:saved.synthesis}):ledger.get(name)};
   const scope=await runStage({phase:'scope',brief,ledger:scopeLedger,providers:getProviders({ledger}),researchVersion:'v5'});
   const audit=directAuditResult(brief,saved.synthesis);
   const result={...audit,data:{...audit.data,scopePlan:scope.scopePlan,proposalCopy:scope.proposalCopy},stage:'audit',engineVersion:'saved-bhs-new-scope-v1',inputHash:briefHash(brief),runId:digest({sourceOfferId:row.id,brief}),cost:await ledger.status()};
   let session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
   if(!session){session=randomBytes(32).toString('base64url');res.setHeader('Set-Cookie','__Host-offer-research='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200');}
   const pricingProof=createPricingProof(getSecret()).encode({kind:'audit_ready',createdAt:now(),briefHash:briefHash(brief),auditHash:digest(result),budgetLeadId:row.lead_id,sourceOfferId:row.id,auditOrigin:saved.origin},session,host);
   return res.status(200).json({phase:'complete',result,pricingProof,cost:result.cost});
  }catch(error){return res.status(422).json({error:error.message||'Mevcut BHS aktarılamadı.',code:error.code||'saved_audit_unavailable'});}
 };
}
export default createReuseHandler();
