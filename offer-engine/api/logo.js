import { captureWebsiteLogo } from '../src/capture.mjs';
import { resolveTarget } from '../src/network.mjs';

let active=false;
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview') return res.status(503).json({error:'Logo servisi şu anda yalnızca korumalı preview ortamında açık.'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Bu işlem POST isteği gerektirir.'});}
  if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  if(active)return res.status(429).json({error:'Logo servisi bir işlem yürütüyor. Kısa süre sonra tekrar dene.'});
  active=true;
  try {
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||typeof body.website!=='string'||body.website.length>2048)return res.status(400).json({error:'Geçerli bir web sitesi adresi gerekli.'});
    await resolveTarget(body.website);
    const result=await captureWebsiteLogo(body.website);
    return res.status(200).json(result);
  } catch(error) {
    console.error('Offer logo capture failed:',error.name);
    return res.status(422).json({error:'Logo alınamadı: '+String(error.message).slice(0,200)});
  } finally {active=false;}
}
