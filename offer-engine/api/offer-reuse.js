import {readResearchSnapshot} from '../src/bhs/research-snapshot.mjs';
import {hasGroundedResearch} from '../src/bhs/research-content.mjs';
import {randomBytes} from 'node:crypto';
import {offersEnabled,runtimeStore,bearer} from '../src/runtime.mjs';
import {budgetFor} from '../src/budget/ledger.mjs';
import {createRuntimeProviders as createBoundedProviders} from '../src/budget/providers.mjs';
import {runBoundedStage,stageKey} from '../src/bhs/direct-research.mjs';
import {directAuditResult} from '../src/bhs/direct-report.mjs';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {offerGeminiKey} from '../src/config.mjs';
import {originalLogoImage} from '../src/contracts.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {restoreBhs,saveBhs} from '../src/bhs/saved-bhs.mjs';
const uuid=/^[a-f0-9-]{36}$/;
const recordId=/^[a-f0-9]{64}$/;
const sessionCookie=req=>(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
function ensureResearchSession(req,res){
 const existing=sessionCookie(req);
 if(existing)return existing;
 const session=randomBytes(32).toString('base64url');
 res.setHeader('Set-Cookie','__Host-offer-research='+session+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200');
 return session;
}

async function savedBhsAction(req,res,body,{store,secret,now,host,jwt}){
 const {action,context,savedReportId,sourceOfferId,researchRunId}=body;
 const options={jwt,leadId:context?.leadId,spaceId:context?.spaceId};
 if(action==='saved-list'){
  return res.status(200).json({reports:await store.call('saved_bhs_list',options)});
 }
 if(action==='saved-save'){
  const brief=snapshotBrief(body.brief),hash=briefHash(brief),session=sessionCookie(req);
  if(!session)throw Error('BHS kayıt oturumu doğrulanamadı.');
  const proof=createPricingProof(secret).decode(body.pricingProof,session,host,now());
  if(proof.kind!=='audit_ready'||proof.budgetLeadId!==options.leadId||proof.briefHash!==hash||proof.auditHash!==digest(body.audit))
   throw Error('BHS kaydı ile tamamlanan analiz uyuşmuyor.');
  const saved=await saveBhs(store,{...options,brief,result:body.audit});
  if(!saved)throw Error('Kayıt için kullanılabilir BHS sonucu bulunamadı.');
  return res.status(200).json({savedBhs:{status:'saved',id:saved.id}});
 }
 if(!recordId.test(savedReportId||''))throw Error('BHS kaydı geçersiz.');
 const row=await store.call('saved_bhs_detail',{...options,id:savedReportId});
 let source;
 if(sourceOfferId!==undefined){
  if(!uuid.test(sourceOfferId||''))throw Error('Kaynak teklif geçersiz.');
  source=await store.detail(jwt,sourceOfferId);
  if(source.lead_id!==options.leadId||source.space_id!==options.spaceId)throw Error('Kaynak teklif farklı karta ait.');
 }
 if(action==='saved-info'){
  return res.status(200).json({brief:row.brief,...(source?{logo:savedLogo(source.customer_document,secret,host)}:{})});
 }
 if(action!=='saved-prepare'||!uuid.test(researchRunId||''))throw Error('BHS kayıt işlemi geçersiz.');
 const brief=snapshotBrief(body.brief),result=restoreBhs(row,brief);
 const pricingProof=createPricingProof(secret).encode({
  kind:'audit_ready',createdAt:now(),briefHash:briefHash(brief),auditHash:digest(result),
  budgetLeadId:options.leadId,budgetResearchRunId:researchRunId,
  ...(source?{sourceOfferId,auditOrigin:{briefHash:result.data.researchReuse.originalBriefHash}}:{})
 },ensureResearchSession(req,res),host);
 return res.status(200).json({phase:'complete',result,pricingProof,cost:result.cost});
}
export function savedLogo(document,secret,host){
 const original=document?.logo?.processing==='original'&&originalLogoImage(document.logo.image);
 if(document?.logo?.reviewed!==true||!(original||document.logo.image?.startsWith('data:image/png;base64,')))return null;
 // This image was already accepted by the signed proposal/save boundary and
 // visually approved. Re-attest the saved bytes; do not process or invent pixels.
 const data={generated:false,reviewed:true,sourceType:original?'saved-original':'saved',...(original?{processing:'original'}:{}),candidates:[{id:'saved',image:document.logo.image,...(original?{}:{source:document.logo.image}),placement:{background:document.logo.background,area:'logo-only'},quality:original?{method:'original'}:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}]};
 return {...data,logoProof:logoProof(secret,host,data)};
}
export async function loadSavedSynthesis(row,ledger){
 const snapshot=row.pricing_snapshot?.researchSnapshot;
 if(snapshot){
  const saved=readResearchSnapshot(snapshot),origin={...(row.pricing_snapshot?.auditOrigin||{}),briefHash:saved.sourceContext.briefHash};
  return {origin,synthesis:{report:saved.report,analysisPacket:saved.analysisPacket,methodologyVersion:saved.methodologyVersion,...(saved.supervision?{supervision:saved.supervision}:{}),researchContext:{brief:saved.sourceContext,briefHash:origin.briefHash},reuse:{sourceOfferId:row.id,researchedAt:saved.researchedAt,originalBriefHash:origin.briefHash,exactBrief:false,contextNeedsConfirmation:true,incrementalResearchCalls:0,historicalCapture:true}}};
 }
 const origin=row.pricing_snapshot?.auditOrigin||{briefHash:row.customer_document?.provenance?.briefHash};
 if(!/^[a-f0-9]{64}$/.test(origin.briefHash||''))throw Error('Kaydedilen BHS dayanağı bulunamadı.');
 const rows=await Promise.allSettled(['synthesis-v5:','synthesis-v4:','report-v3:'].map(async version=>ledger.get('audit:synthesis:'+version+origin.briefHash)));
 for(const result of rows){
  const step=result.status==='fulfilled'?result.value:null;
  if(step?.state!=='complete'||!step.value?.report)continue;
  const synthesis={...structuredClone(step.value),reuse:{sourceOfferId:row.id,researchedAt:step.created_at||row.created_at,originalBriefHash:origin.briefHash,exactBrief:false,contextNeedsConfirmation:true,incrementalResearchCalls:0}};
  if(hasGroundedResearch(directAuditResult(synthesis.researchContext?.brief||{},synthesis).data))return {origin,synthesis};
 }
 throw Error('Bu teklifin saklanan BHS raporuna ulaşılamadı. Yeni ücretli analiz otomatik başlatılmadı.');
}
export function createReuseHandler({getStore=runtimeStore,getLedger=budgetFor,getProviders=createBoundedProviders,getSecret=offerGeminiKey,runStage=runBoundedStage,now=Date.now}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'Teklif servisi etkin değil.'});
  const host=req.headers.host;if(req.method!=='POST'||!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
   if(Number(req.headers['content-length'])>1200000)throw Error('Brief boyutu sınırı aşıldı.');
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
   const maximum=b?.action==='saved-save'?1200000:100000;
   if(!b||JSON.stringify(b).length>maximum)throw Error('Teklif kaydı geçersiz.');
   const jwt=bearer(req);if(!jwt)throw Error('Pipeline oturumu gerekli.');
   if(['saved-list','saved-info','saved-prepare','saved-save'].includes(b.action)){
    return await savedBhsAction(req,res,b,{store:getStore(),secret:getSecret(),now,host,jwt});
   }
   if(!uuid.test(b.sourceOfferId||''))throw Error('Teklif kaydı geçersiz.');
   const row=await getStore().detail(jwt,b.sourceOfferId);
   if(row.lead_id!==b.context?.leadId||row.space_id!==b.context?.spaceId)throw Error('Teklif farklı karta ait.');
   if(b.action==='info')return res.status(200).json({brand:row.customer_document.brand,segment:row.pricing_snapshot.segment||row.pricing_snapshot.offerBrief?.segment,currency:row.customer_document.quote?.currency||'TRY',language:row.customer_document.language||'tr',logo:savedLogo(row.customer_document,getSecret(),host)});
   if(b.action!=='prepare'||!uuid.test(b.researchRunId||''))throw Error('Teklif işlemi geçersiz.');
   const brief=snapshotBrief(b.brief),origin=row.pricing_snapshot?.auditOrigin;
   const sourceLedger=row.pricing_snapshot?.researchSnapshot?null:await getLedger(req,res,row.lead_id,origin?.researchRunId?{researchRunId:origin.researchRunId}:{});
   const saved=await loadSavedSynthesis(row,sourceLedger);
   const ledger=await getLedger(req,res,row.lead_id,{researchRunId:b.researchRunId});await ledger.begin();
   // Only commercial scope/copy can call a model. The synthesis comes from the
   // selected authorised offer's saved research, including its original date and market.
   const key=stageKey(brief,'synthesis','v5'),scopeLedger={...ledger,get:name=>name===key?Promise.resolve({state:'complete',value:saved.synthesis}):ledger.get(name)};
   const scope=await runStage({phase:'scope',brief,ledger:scopeLedger,providers:getProviders({ledger}),researchVersion:'v5'});
   const audit=directAuditResult(brief,saved.synthesis);
   const result={...audit,data:{...audit.data,scopePlan:scope.scopePlan,proposalCopy:scope.proposalCopy},stage:'audit',engineVersion:'saved-bhs-new-scope-v1',inputHash:briefHash(brief),runId:digest({sourceOfferId:row.id,brief}),cost:await ledger.status()};
   const session=ensureResearchSession(req,res);
   const pricingProof=createPricingProof(getSecret()).encode({kind:'audit_ready',createdAt:now(),briefHash:briefHash(brief),auditHash:digest(result),budgetLeadId:row.lead_id,budgetResearchRunId:b.researchRunId,sourceOfferId:row.id,auditOrigin:saved.origin},session,host);
   return res.status(200).json({phase:'complete',result,pricingProof,cost:result.cost});
  }catch(error){return res.status(422).json({error:error.message||'Mevcut BHS aktarılamadı.',code:error.code||'saved_audit_unavailable'});}
 };
}
export default createReuseHandler();
