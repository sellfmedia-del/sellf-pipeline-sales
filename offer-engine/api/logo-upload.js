import {logoProof} from '../src/proposal/logo-proof.mjs';
import {createOfferWorkflow} from '../src/offer-workflow.mjs';
let active=false;

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'Logo servisi yalnızca korumalı önizlemede açık.'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Bu işlem POST isteği gerektirir.'});}
  if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  if(active)return res.status(429).json({error:'Bir görsel işleniyor. Kısa süre sonra tekrar dene.'});
  active=true;
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const result=await createOfferWorkflow().run('logo',{image:body?.image});
    return res.status(200).json({...result.data,...(process.env.OFFER_GEMINI_API_KEY?{logoProof:logoProof(process.env.OFFER_GEMINI_API_KEY,req.headers.host,result.data)}:{})});
  }catch(error){
    const message=String(error.message);
    return res.status(422).json({error:/PNG|Görsel|Logo|Bu görselde/.test(message)?message.slice(0,250):'Görsel okunamadı. Geçerli bir PNG, JPG veya WebP ekran görüntüsü seç.'});
  }finally{active=false;}
}
