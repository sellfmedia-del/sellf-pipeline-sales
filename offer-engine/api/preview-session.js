import {createPreviewStore} from '../src/proposal/preview-store.mjs';
import {sessionFor,setSession} from '../src/proposal/preview-session.mjs';
export function createPreviewSessionHandler({getStore=()=>createPreviewStore(),getSecret=()=>process.env.OFFER_PORTAL_SECRET}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(process.env.VERCEL_ENV!=='preview'||process.env.OFFER_PREVIEW_MODE!=='true')return res.status(503).json({error:'Kalıcı test alanı bu ortamda kapalı.'});
  const store=getStore();if(!store.configured())return res.status(503).json({error:'Kalıcı test alanı henüz yapılandırılmadı.'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET veya POST gerekli.'});
  if(req.method==='POST'&&req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
   let session=await sessionFor(req,res,store,getSecret());
   if(req.method==='POST'){
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||JSON.stringify(body).length>1000000)throw Error('Test verisi boyut sınırı aşıldı.');
    if(body?.action==='logout'){res.setHeader('Set-Cookie','__Host-offer-preview-session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');return res.status(200).json({ready:false});}
    if(['sync-cards','delete-cards'].includes(body?.action)){
     if(!session)throw Error('Test oturumu gerekli.');
     if(body.action==='sync-cards')return res.status(200).json(await store.syncCards(session.accessToken,body.leads));
     return res.status(200).json(await store.deleteCards(session.accessToken,body.field,body.value));
    }
    if(body?.action!=='start')throw Error('Test işlemi geçersiz.');
    if(!session){const created=await store.bootstrap();session={accessToken:created.accessToken,refreshToken:created.refreshToken,expiresAt:created.expiresAt,createdAt:Date.now()};setSession(res,req,session,getSecret());return res.status(200).json({ready:true,mode:'isolated-preview',fixture:created.fixture});}
   }
   if(!session)return res.status(200).json({ready:false,mode:'isolated-preview'});
   return res.status(200).json({ready:true,mode:'isolated-preview',fixture:await store.fixture(session.accessToken)});
  }catch(error){return res.status(422).json({error:error.message||'Test oturumu açılamadı.'});}
 };
}
export default createPreviewSessionHandler();
