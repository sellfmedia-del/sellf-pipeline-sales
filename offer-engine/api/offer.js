import {publicationUrl} from '../src/proposal/publication.mjs';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {sessionFor} from '../src/proposal/preview-session.mjs';
import {createOfferStore} from '../src/proposal/storage.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
export function createOfferHandler({getStore=()=>process.env.OFFER_PREVIEW_MODE==='true'?createPreviewStore():createOfferStore(),getSecret=()=>process.env.OFFER_GEMINI_API_KEY||process.env.GEMINI_API_KEY,getPortalSecret=()=>process.env.OFFER_PORTAL_SECRET}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'Teklif kaydı yalnızca korumalı önizlemede açık.'});
  const store=getStore();
  if(req.method==='GET')return res.status(200).json({persistence:store.configured(),customerPortal:store.portalConfigured()&&Boolean(getPortalSecret()),contractMail:true,mailTransport:'mailto'});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
   if(Number(req.headers['content-length'])>4200000)throw Error('Teklif boyutu sınırı aşıldı.');
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||JSON.stringify(b).length>4200000)throw Error('Teklif bilgileri geçersiz.');
   const suppliedToken=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,5000})$/)?.[1];
   const testSession=store.mode==='isolated-preview'&&['save','publish','list','outbox'].includes(b.action)?await sessionFor(req,res,store,getPortalSecret()):null;
   const token=suppliedToken||testSession?.accessToken;
   if(['save','publish','list','outbox'].includes(b.action)&&!token)throw Error('Kaydetmek için Pipeline oturumu gerekli. Bu önizlemede kayıt ve kart değeri değiştirilmedi.');
   if(b.action==='save'){
    if(b.logoApproved!==true||b.scopeApproved!==true)throw Error('Logo ve kapsam kontrolünü tamamla.');
    const session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!session)throw Error('Teklif doğrulama oturumu gerekli.');
    const proof=createPricingProof(getSecret()).decode(b.saveProof,session,host);
    if(proof.kind!=='proposal_ready'||proof.leadId!==b.leadId||proof.spaceId!==b.spaceId||proof.proposalHash!==digest(b.proposal)||proof.pricingHash!==digest(b.pricing))throw Error('Doğrulanmış teklif veya fiyat kaydı değişmiş.');
    const document=structuredClone(b.proposal.data);document.logo.reviewed=true;
    const offer=await store.save(token,{p_lead_id:b.leadId,p_space_id:b.spaceId,p_request_id:b.proposal.runId,p_document:document,p_pricing:b.pricing.data});
    return res.status(200).json({offer});
   }
   if(b.action==='outbox'){if(store.mode!=='isolated-preview')throw Error('Test bildirimleri bu ortamda kapalı.');return res.status(200).json({requests:await store.outbox(token)});}
   if(b.action==='list'){const rows=await store.list(token,String(b.leadId||''));return res.status(200).json({offers:rows.map(row=>{const {ownerLink,...offer}=row;return {...offer,...(ownerLink?{publicUrl:publicationUrl(host,ownerLink),password:ownerLink.password}:{})};})});}
   if(b.action==='publish'){
    if(!store.portalConfigured()||!getPortalSecret())throw Error('Müşteri bağlantısı için teklif kaydı ve bağlantı güvenliği tamamlanmalı.');
    if(!/^[a-f0-9-]{36}$/.test(b.offerId))throw Error('Teklif kaydı geçersiz.');
    const published=await store.publish(token,b.offerId,getPortalSecret());
    return res.status(200).json({...published,url:publicationUrl(host,published)});
   }
   if(b.action==='request')throw Error('Sözleşme talebi, teklifteki e-posta düğmesiyle e-posta uygulamanızdan gönderilir.');
   if(b.action!=='access')throw Error('Teklif işlemi geçersiz.');
   const offer=b.slug&&store.accessSlug?await store.accessSlug(b.slug,b.password,getPortalSecret()):await store.access(b.token,b.password,getPortalSecret());
   return res.status(200).json({id:offer.id,version:offer.version,document:{...offer.customer_document,version:offer.version}});
  }catch(error){return res.status(422).json({error:error.message||'Teklif işlemi tamamlanamadı.'});}
 };
}
export default createOfferHandler();
