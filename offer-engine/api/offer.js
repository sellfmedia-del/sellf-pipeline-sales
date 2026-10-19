import {createOfferStore} from '../src/proposal/storage.mjs';
import {createContractMailer,contractMessage} from '../src/proposal/mail.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
export function createOfferHandler({getStore=()=>createOfferStore(),getMailer=()=>createContractMailer(),getSecret=()=>process.env.OFFER_GEMINI_API_KEY,getPortalSecret=()=>process.env.OFFER_PORTAL_SECRET}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'Teklif kaydı yalnızca korumalı önizlemede açık.'});
  const store=getStore(),mailer=getMailer();
  if(req.method==='GET')return res.status(200).json({persistence:store.configured(),customerPortal:store.portalConfigured()&&Boolean(getPortalSecret()),contractMail:mailer.configured()});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
   if(Number(req.headers['content-length'])>4200000)throw Error('Teklif boyutu sınırı aşıldı.');
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||JSON.stringify(b).length>4200000)throw Error('Teklif bilgileri geçersiz.');
   const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,5000})$/)?.[1];
   if(['save','publish','list'].includes(b.action)&&!token)throw Error('Kaydetmek için Pipeline oturumu gerekli. Bu önizlemede kayıt ve kart değeri değiştirilmedi.');
   if(b.action==='save'){
    if(b.logoApproved!==true||b.scopeApproved!==true)throw Error('Logo ve kapsam kontrolünü tamamla.');
    const session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!session)throw Error('Teklif doğrulama oturumu gerekli.');
    const proof=createPricingProof(getSecret()).decode(b.saveProof,session,host);
    if(proof.kind!=='proposal_ready'||proof.leadId!==b.leadId||proof.spaceId!==b.spaceId||proof.proposalHash!==digest(b.proposal)||proof.pricingHash!==digest(b.pricing))throw Error('Doğrulanmış teklif veya fiyat kaydı değişmiş.');
    const document=structuredClone(b.proposal.data);document.logo.reviewed=true;
    const offer=await store.save(token,{p_lead_id:b.leadId,p_space_id:b.spaceId,p_request_id:b.proposal.runId,p_document:document,p_pricing:b.pricing.data});
    return res.status(200).json({offer});
   }
   if(b.action==='list')return res.status(200).json({offers:await store.list(token,String(b.leadId||''))});
   if(b.action==='publish'){
    if(!store.portalConfigured()||!mailer.configured()||!getPortalSecret())throw Error('Müşteri bağlantısı için teklif kayıt ve e-posta bağlantıları tamamlanmalı.');
    if(!/^[a-f0-9-]{36}$/.test(b.offerId))throw Error('Teklif kaydı geçersiz.');
    const published=await store.publish(token,b.offerId,getPortalSecret());
    return res.status(200).json({...published,url:'https://'+host+'/offers/customer.html#'+published.token});
   }
   if(!['access','request'].includes(b.action))throw Error('Teklif işlemi geçersiz.');
   const offer=await store.access(b.token,b.password,getPortalSecret());
   if(b.action==='access')return res.status(200).json({id:offer.id,version:offer.version,document:offer.customer_document});
   if(!mailer.configured())throw Error('Sözleşme bildirimi için e-posta bağlantısı henüz tanımlı değil.');
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.requestId)||typeof b.name!=='string'||!b.name.trim()||b.name.length>160||/[\r\n]/.test(b.name)||typeof b.email!=='string'||b.email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(b.email))throw Error('Yetkili adı ve geçerli iş e-postası gerekli.');
   const alternative=offer.customer_document.alternatives.find(a=>a.id===b.alternativeId);if(!alternative)throw Error('Geçerli işbirliği alternatifini seç.');
   const input={requestId:b.requestId,alternativeId:b.alternativeId,name:b.name.trim(),email:b.email.trim().toLowerCase(),monthlyAmount:alternative.monthlyAmount};
   const queued=await store.queue(offer,input,contractMessage(offer,input,mailer.from));
   if(queued.delivery_state==='accepted')return res.status(200).json({delivered:true});
   if(!await store.claim(queued.id))return res.status(202).json({delivered:false,message:'Talep kaydedildi; e-posta gönderimi kontrol ediliyor. Yeni bir talep göndermeniz gerekmiyor.'});
   let providerId;
   try{providerId=await mailer.send(queued.id,queued.mail_payload);}catch{await store.mark(queued.id,'uncertain');return res.status(202).json({delivered:false,message:'Talep kaydedildi; e-posta gönderimi doğrulanamadı. Sellf ekibi gönderim kaydını kontrol etmeli.'});}
   await store.mark(queued.id,'accepted',providerId);
   return res.status(200).json({delivered:true});
  }catch(error){return res.status(422).json({error:error.message||'Teklif işlemi tamamlanamadı.'});}
 };
}
export default createOfferHandler();
