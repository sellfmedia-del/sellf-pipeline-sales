import {offersEnabled,runtimeStore,productionOffers} from '../src/runtime.mjs';
import {publicationUrl} from '../src/proposal/publication.mjs';
import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {sessionFor} from '../src/proposal/preview-session.mjs';
import {createOfferStore} from '../src/proposal/storage.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {priceTerms,negotiatedDocument} from '../src/proposal/negotiation.mjs';
export function createOfferHandler({getStore=()=>productionOffers()||process.env.OFFER_PREVIEW_MODE==='true'?runtimeStore():createOfferStore(),getSecret=()=>process.env.OFFER_GEMINI_API_KEY||process.env.GEMINI_API_KEY,getPortalSecret=()=>process.env.OFFER_PORTAL_SECRET}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'Teklif kaydı yalnızca korumalı önizlemede açık.'});
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
   if(['save','publish','list','outbox','detail','catalog','prices','price_history'].includes(b.action)&&!token)throw Error('Kaydetmek için Pipeline oturumu gerekli. Bu önizlemede kayıt ve kart değeri değiştirilmedi.');
   const ownerOffer=row=>{const {ownerLink,pricing_snapshot,...offer}=row;return {...offer,...(ownerLink?{publicUrl:publicationUrl(host,ownerLink),password:ownerLink.password}:{})};};
   if(b.action==='catalog')return res.status(200).json({offers:await store.catalog(token,String(b.leadId||''))});
   if(['detail','prices','price_history'].includes(b.action)){
    if(!/^[a-f0-9-]{36}$/.test(b.offerId||''))throw Error('Teklif kaydı geçersiz.');
    if(b.action==='price_history')return res.status(200).json({changes:await store.priceHistory(token,b.offerId)});
    const row=await store.detail(token,b.offerId);
    if(b.action==='detail')return res.status(200).json({offer:ownerOffer(row),priceTerms:priceTerms(row)});
    if(!/^[a-f0-9-]{36}$/.test(b.requestId||''))throw Error('Fiyat güncelleme isteği geçersiz.');
    // Gateway/RPC also check this atomically under a row lock. Never overwrite
    // another user's concurrent edit or accept a client-supplied document.
    if(b.expectedDocumentHash!==digest(row.customer_document)){
     // A successful write may have lost its HTTP response. The private worker
     // recognizes a matching request before checking optimistic concurrency.
     const changes=await store.call('price_request',{jwt:token,id:b.offerId,requestId:b.requestId});
     const amounts=Object.fromEntries(Object.entries(b.amounts||{}).map(([id,value])=>[id,Number(value)]));
     if(changes?.after_prices&&JSON.stringify(Object.keys(amounts).sort())===JSON.stringify(Object.keys(changes.after_prices).sort())&&Object.keys(amounts).every(id=>amounts[id]===Number(changes.after_prices[id]))&&changes.below_minimum_confirmed===(b.confirmedBelowMinimum===true))return res.status(200).json({offer:ownerOffer(row),priceTerms:priceTerms(row)});
     throw Error('Teklif başka bir işlemde güncellendi. Güncel fiyatları açıp tekrar dene.');
    }
    const change=negotiatedDocument(row,b.amounts,{confirmedBelowMinimum:b.confirmedBelowMinimum===true});
    await store.updatePrices(token,{id:b.offerId,requestId:b.requestId,expectedDocument:row.customer_document,amounts:change.input,confirmedBelowMinimum:b.confirmedBelowMinimum===true});
    const saved=await store.detail(token,b.offerId);return res.status(200).json({offer:ownerOffer(saved),priceTerms:priceTerms(saved)});
   }
   if(b.action==='save'){
    if(b.logoApproved!==true||b.scopeApproved!==true)throw Error('Logo ve kapsam kontrolünü tamamla.');
    const session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!session)throw Error('Teklif doğrulama oturumu gerekli.');
    const proof=createPricingProof(getSecret()).decode(b.saveProof,session,host);
    if(proof.kind!=='proposal_ready'||proof.leadId!==b.leadId||proof.spaceId!==b.spaceId||proof.proposalHash!==digest(b.proposal)||proof.pricingHash!==digest(b.pricing))throw Error('Doğrulanmış teklif veya fiyat kaydı değişmiş.');
    const document=structuredClone(b.proposal.data);document.logo.reviewed=true;
    const args={p_lead_id:b.leadId,p_space_id:b.spaceId,p_request_id:b.proposal.runId,p_document:document,p_pricing:b.pricing.data};
    const offer=proof.sourceOfferId?await store.saveVariant(token,args,proof.sourceOfferId):await store.save(token,args);
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
