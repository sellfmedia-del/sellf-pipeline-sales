import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { createPublicFetcher, resolveTarget } from './network.mjs';
import { finishLogo } from './pixels.mjs';
import sharp from 'sharp';

export function candidatesInDocument() {
  const all=[...document.querySelectorAll('header img, header svg, header a, nav img, nav svg, [class*="logo" i], [id*="logo" i], [class*="brand" i], a[href="/"], img[alt*="logo" i]')];
  const seen=new Set(),result=[];
  for(const element of all) {
    if(seen.has(element)||element.closest('footer'))continue;seen.add(element);
    const box=element.getBoundingClientRect(),style=getComputedStyle(element);
    if(box.width<30||box.height<12||box.width>620||box.height>200||box.top<0||box.top>340||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;
    const hint=[element.id,element.className?.baseVal??element.className,element.getAttribute('alt'),element.getAttribute('aria-label'),element.getAttribute('title')].filter(Boolean).join(' ').toLowerCase();
    const children=[...element.querySelectorAll('img,svg')];
    const home=element.tagName==='A'&&(()=>{try{return new URL(element.href).origin===location.origin&&['/','/en','/tr','/en/','/tr/'].includes(new URL(element.href).pathname);}catch{return false;}})();
    const visual=['IMG','svg'].includes(element.tagName)||children.length||style.backgroundImage!=='none';
    const logo=/logo|brand|logotype/.test(hint)||children.some(c=>/logo|brand/.test([c.getAttribute('alt'),c.getAttribute('class')].join(' ')));
    if(!visual&&!logo)continue;
    if(/favicon|social|facebook|instagram|linkedin|youtube|payment|visa|mastercard|partner|client/.test(hint))continue;
    let score=(logo?80:0)+(home?65:0)+(element.closest('header,nav,[role=banner]')?30:0)+(box.top<160?15:0)+(box.left<600?8:0);
    if(element.tagName==='IMG')score+=12;
    if(home&&children.length)score+=18;
    if(box.width/box.height>1.1)score+=8;
    if(children.length>3)score-=100;
    if(element.textContent.trim().length>65)score-=100;
    if(score<55)continue;
    const img=element.tagName==='IMG'?element:element.querySelector('img');
    const vector=!img||/\.svg(?:[?#]|$)|^data:image\/svg/i.test(img.currentSrc||img.src);
    const nativeWidth=img?.naturalWidth||0;
    const imageDisplayWidth=img?.getBoundingClientRect().width||box.width;
    const imgStyle=img&&getComputedStyle(img);
    let plainAncestors=true;
    for(let parent=img;parent;parent=parent.parentElement){const css=getComputedStyle(parent);if(css.filter!=='none'||css.mixBlendMode!=='normal'||Number(css.opacity)!==1||css.clipPath!=='none')plainAncestors=false;}
    const directImage=img&&children.length<=1&&!element.querySelector('svg')&&!element.textContent.trim()&&plainAncestors&&['fill','contain'].includes(imgStyle.objectFit);
    result.push({element,score,box:{x:box.left,y:box.top,width:box.width,height:box.height},kind:element.tagName.toLowerCase(),hint:hint.slice(0,140),vector,nativeWidth,imageDisplayWidth,nativeHeight:img?.naturalHeight||0,imageSource:directImage?(img.currentSrc||img.src):null});
  }
  result.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const item of result){
    if(selected.some(other=>Math.abs(other.box.x-item.box.x)<12&&Math.abs(other.box.y-item.box.y)<12&&Math.abs(other.box.width-item.box.width)<30&&Math.abs(other.box.height-item.box.height)<20))continue;
    const id='offer-logo-'+selected.length;item.element.setAttribute('data-offer-logo',id);
    selected.push({...item,id});if(selected.length===3)break;
  }
  return selected.map(({element,...rest})=>rest);
}

function dataUrl(bytes) { return 'data:image/png;base64,'+bytes.toString('base64'); }

export async function enterCountrySite(page, deadline) {
  // Public country selectors can be the entire entry page. Select a visible,
  // ordinary navigation button; no guessed URLs or form submissions.
  const selector=await page.evaluate(()=>/select your country|choose your country/i.test(document.body.innerText)&&document.querySelectorAll('button').length>1);
  if(!selector)return;
  for(const name of [/Türkiye|Turkey/i,/Global/i,/United Kingdom/i]) {
    const button=page.getByRole('button',{name}).first();
    if(!await button.count()||!await button.isVisible())continue;
    const before=page.url();
    await Promise.all([page.waitForURL(url=>url.href!==before,{timeout:Math.min(8000,Math.max(1000,deadline-Date.now()-18000))}).catch(()=>{}),button.click({timeout:3000}).catch(()=>{})]);
    if(page.url()!==before){await page.goto(page.url(),{waitUntil:'load',timeout:Math.max(1000,deadline-Date.now()-15000)});}
    break;
  }
}

// Use the actual site's raster asset at native resolution. Screenshot padding
// must not hide an opaque image's white backdrop from the matte remover.
async function rasterSource(candidate, read) {
  if(!candidate.imageSource||candidate.vector)return null;
  const current=new URL(candidate.imageSource);
  const urls=[current.href];
  if(current.hostname==='static.wixstatic.com'&&current.pathname.includes('/media/')&&current.pathname.includes('/v1/')) {
    const original=new URL(current);original.pathname=original.pathname.split('/v1/')[0];original.search='';urls.unshift(original.href);
  }
  for(const url of urls) {
    try {
      const response=await read(url);
      if(response.status!==200)continue;
      const meta=await sharp(response.body,{limitInputPixels:16000000}).metadata();
      if(!['png','jpeg','webp','avif','gif'].includes(meta.format)||!meta.width||!meta.height||meta.pages>1)continue;
      if(meta.width*meta.height>4000000||Math.abs((meta.width/meta.height)/(candidate.nativeWidth/candidate.nativeHeight)-1)>.03)continue;
      const processed=await finishLogo(response.body);
      return {...processed,quality:{...processed.quality,sourceKind:'native-raster',nativeWidth:meta.width,nativeHeight:meta.height}};
    }catch{/* Keep the rendered-page fallback when an asset cannot be used. */}
  }
  return null;
}

export async function captureWebsiteLogo(input, { browser:providedBrowser, testRoute, timeout=55000 }={}) {
  if(!testRoute) await resolveTarget(input);
  const deadline=Date.now()+timeout;
  const browser=providedBrowser||await playwright.launch({args:[...chromium.args,'--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],executablePath:await chromium.executablePath(),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:3,serviceWorkers:'block',acceptDownloads:false});
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  const read=createPublicFetcher({deadline:deadline-8000});
  const blocked=[];
  try {
    await context.routeWebSocket('**',route=>route.close());
    await context.route('**/*',async route=>{
      const request=route.request();
      if(!['GET','HEAD'].includes(request.method())||['media','websocket'].includes(request.resourceType()))return route.abort();
      try {
        const result=testRoute?await testRoute(request.url()):await read(request.url());
        if(!result) return route.abort();
        await route.fulfill({status:result.status,headers:result.headers,body:result.body});
      } catch(error) { blocked.push(error.message); await route.abort().catch(()=>{}); }
    });
    const response=await page.goto(input,{waitUntil:'load',timeout:Math.max(1000,deadline-Date.now()-15000)});
    if(!response||response.status()>=400)throw new Error('Site açılamadı. Site erişim kısıtı veya bağlantı hatası olabilir.');
    const pageTitle=await page.title();
    if(/just a moment|access denied|verify you are human|checking your browser/i.test(pageTitle))throw new Error('Site otomatik erişim için insan doğrulaması istiyor.');
    await enterCountrySite(page,deadline);
    await page.evaluate(async()=>{
      await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,3500))]);
      await Promise.all([...document.images].filter(img=>img.getBoundingClientRect().top<400).map(img=>Promise.race([img.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))])));
      document.getAnimations().forEach(animation=>{try{animation.finish();}catch{animation.cancel();}});
    });
    const candidates=await page.evaluate(candidatesInDocument);
    if(!candidates.length)throw new Error('Sayfanın üst bölümündeki logo alanı güvenle ayrıştırılamadı.');
    const results=[];
    for(const candidate of candidates) {
      if(Date.now()>deadline-5000)break;
      const box=candidate.box;
      const clip={x:Math.max(0,box.x-8),y:Math.max(0,box.y-8),width:Math.min(1440-Math.max(0,box.x-8),box.width+16),height:box.height+16};
      const original=await page.screenshot({type:'png',clip,animations:'disabled',timeout:5000});
      await page.evaluate(id=>{
        const selected=document.querySelector('[data-offer-logo="'+id+'"]');
        const changed=[];
        const change=(element,properties)=>{
          changed.push([element,element.getAttribute('style')]);
          Object.entries(properties).forEach(([key,value])=>element.style.setProperty(key,value,'important'));
        };
        change(document.documentElement,{visibility:'hidden',background:'transparent'});
        for(let element=selected.parentElement;element;element=element.parentElement)change(element,{background:'transparent','background-image':'none','box-shadow':'none','border-color':'transparent'});
        for(const element of [selected,...selected.querySelectorAll('*')])change(element,{visibility:'visible'});
        // Keep intrinsic artwork and its fills; only the page's backdrop is removed.
        window.__offerLogoRestore=()=>{for(const [element,style]of changed.reverse()){if(style===null)element.removeAttribute('style');else element.setAttribute('style',style);}delete window.__offerLogoRestore;};
      },candidate.id);
      let transparent;
      try { transparent=await page.screenshot({type:'png',clip,omitBackground:true,animations:'disabled',timeout:5000}); }
      finally { await page.evaluate(()=>window.__offerLogoRestore?.()); }
      const raster=await rasterSource(candidate,testRoute||read);
      const processed=raster||await finishLogo(transparent,original);
      const highEnough=raster
        ? Math.max(processed.quality.width-24,processed.quality.height-24)>=360&&Math.min(processed.quality.width-24,processed.quality.height-24)>=40
        : processed.quality.width>=Math.min(360,box.width*2)&&processed.quality.height>=40&&(candidate.vector||candidate.nativeWidth>=Math.min(360,candidate.imageDisplayWidth*2));
      if(!highEnough)processed.quality.status='review';
      results.push({id:candidate.id,score:candidate.score,source: dataUrl(original),image:dataUrl(processed.png),quality:{...processed.quality,highEnough},box,kind:candidate.kind});
    }
    if(!results.length)throw new Error('Logo işleme süresi aşıldı.');
    return {website:new URL(input).origin,finalUrl:page.url(),pageTitle,candidates:results,generated:false};
  } finally { await context.close();if(!providedBrowser)await browser.close(); }
}
