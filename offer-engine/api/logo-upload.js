import {logoProof} from '../src/proposal/logo-proof.mjs';
import {createOfferWorkflow} from '../src/offer-workflow.mjs';
import sharp from 'sharp';
import {createLogoEngine} from '../src/engines/logo-engine.mjs';
import {budgetFor} from '../src/budget/ledger.mjs';
import {createBoundedProviders} from '../src/budget/providers.mjs';
import {logoRegionSchema,logoRegionInstruction} from '../src/logo-region.mjs';
let active=0;

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview')return res.status(503).json({error:'Logo servisi yalnızca korumalı önizlemede açık.'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Bu işlem POST isteği gerektirir.'});}
  if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  if(active>=4)return res.status(429).json({error:'Bir görsel işleniyor. Kısa süre sonra tekrar dene.'});
  active++;
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const locate=body?.context?.leadId?async source=>{
      const ledger=await budgetFor(req,res,body.context.leadId);await ledger.begin();
      const image=await sharp(source).resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
      const result=await createBoundedProviders({ledger}).generate('logo-region',{instruction:logoRegionInstruction,brandName:String(body.brandName||'').slice(0,200)},logoRegionSchema,{maxOutputTokens:1024,jsonMode:true,image:{mimeType:'image/webp',data:image.toString('base64')}});
      console.info(JSON.stringify({event:'logo_region',found:result.data.found,cost:await ledger.status()}));return result.data;
    }:undefined;
    const result=await createOfferWorkflow({logo:createLogoEngine({locate})}).run('logo',{image:body?.image});
    const secret=process.env.OFFER_GEMINI_API_KEY||process.env.GEMINI_API_KEY;
    return res.status(200).json({...result.data,...(secret?{logoProof:logoProof(secret,req.headers.host,result.data)}:{})});
  }catch(error){
    console.warn(JSON.stringify({event:'logo_upload_error',code:error.code||'logo_extraction',message:String(error.message).slice(0,250)}));
    const message=String(error.message);
    return res.status(422).json({code:error.code||'logo_extraction',error:error.code||/PNG|Görsel|Logo|Bu görselde/.test(message)?message.slice(0,250):'Görsel okunamadı. Geçerli bir PNG, JPG veya WebP ekran görüntüsü seç.'});
  }finally{active--;}
}
