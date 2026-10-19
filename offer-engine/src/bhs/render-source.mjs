import chromium from '@sparticuz/chromium';
import {chromium as playwright} from 'playwright-core';
import {resolveTarget} from '../network.mjs';

// Fresh public browser, no saved identity or credentials. Every resource and
// redirect goes through the same DNS-pinned bounded reader as ordinary fetches.
export async function renderEvidencePages(candidates,{read,deadline,browser:providedBrowser}={}){
 const browser=providedBrowser||await playwright.launch({args:[...chromium.args,'--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],executablePath:await chromium.executablePath(),headless:true});
 const results=[];
 try{
  for(const candidate of candidates){
   if(Date.now()>deadline-3000)break;
   await resolveTarget(candidate.finalUrl);
   const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,viewport:{width:1280,height:900}});
   try{
    await context.routeWebSocket('**',route=>route.close());
    await context.route('**/*',async route=>{
     const req=route.request();if(!['GET','HEAD'].includes(req.method())||['image','font','media','websocket'].includes(req.resourceType()))return route.abort();
     try{const response=await read(req.url(),{headers:req.headers()});await route.fulfill({status:response.status,headers:response.headers,body:response.body});}catch{await route.abort().catch(()=>{});}
    });
    const page=await context.newPage();
    const response=await page.goto(candidate.finalUrl,{waitUntil:'load',timeout:Math.max(1000,Math.min(16000,deadline-Date.now()-1000))});
    if(!response||response.status()!==200)continue;
    await page.waitForTimeout(Math.max(0,Math.min(1200,deadline-Date.now()-1000)));
    const result=await page.evaluate(()=>({title:document.title.slice(0,300),text:document.body.innerText.slice(0,250000)}));
    if(!/verify you are human|access denied|captcha|just a moment/i.test(result.title+' '+result.text.slice(0,1000)))results.push({...candidate,...result,finalUrl:page.url()});
   }catch{/* Unreadable pages remain unavailable, never fabricated. */}
   finally{await context.close();}
  }
 }finally{if(!providedBrowser)await browser.close();}
 return results;
}
