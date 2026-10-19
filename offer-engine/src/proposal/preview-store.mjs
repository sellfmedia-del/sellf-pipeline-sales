import {sealSession,openEnvelope} from './preview-session.mjs';
import {randomBytes} from 'node:crypto';
import {tokenHash,passwordHash} from './storage.mjs';
export function createPreviewStore({url=process.env.OFFER_STORAGE_GATEWAY_URL,key=process.env.OFFER_STORAGE_GATEWAY_KEY,portalSecret=process.env.OFFER_PORTAL_SECRET,enabled=process.env.OFFER_PREVIEW_MODE==='true'&&process.env.OFFER_PERSISTENCE_ENABLED==='true',fetchImpl=fetch}={}){
 let capability;
 async function call(action,body={}){
  if(!enabled||!key||!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/pipeline-offer-preview-store$/.test(url||''))throw Error('Kalıcı test alanı henüz etkin değil.');
  const r=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','x-offer-store-key':key},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(40000),redirect:'error'});
  let data;try{data=await r.json();}catch{throw Error('Test kayıt servisi yanıt vermedi.');}if(!r.ok)throw Error(data.error||'Test kaydı tamamlanamadı.');return data;
 }
 return {configured:()=>enabled&&Boolean(url&&key),portalConfigured:()=>enabled&&Boolean(url&&key),mode:'isolated-preview',call,
  syncCards:(jwt,leads)=>call('sync_cards',{jwt,leads}),deleteCards:(jwt,field,value)=>call('delete_cards',{jwt,field,value}),
  bootstrap:()=>call('bootstrap'),refresh:refreshToken=>call('refresh',{refreshToken}),fixture:jwt=>call('fixture',{jwt}),
  save:(jwt,args)=>call('save',{jwt,args}),async list(jwt,leadId){const rows=await call('list',{jwt,leadId});return rows.map(row=>{const {operator_link_envelope,...value}=row;return {...value,...(operator_link_envelope?{ownerLink:openEnvelope(operator_link_envelope,portalSecret,'published-link:'+row.id)}:{})};});},outbox:jwt=>call('outbox',{jwt}),
  async publish(jwt,id,secret){const token=randomBytes(32).toString('base64url'),password=randomBytes(12).toString('base64url');const rows=await call('publish',{jwt,id,tokenHash:tokenHash(token),passwordHash:passwordHash(secret,token,password),operatorLinkEnvelope:sealSession({token,password},secret,'published-link:'+id)});if(rows?.length!==1)throw Error('Test teklifi yayınlama yetkisi doğrulanamadı.');return {id,version:rows[0].version,token,password};},
  async access(token,password,secret){if(!/^[A-Za-z0-9_-]{43}$/.test(token||'')||typeof password!=='string'||password.length>128)throw Error('Test bağlantısı veya şifresi geçersiz.');capability={tokenHash:tokenHash(token),passwordHash:passwordHash(secret,token,password)};return call('access',capability);},
  queue:(offer,input,payload)=>call('queue',{offerId:offer.id,input,payload,...capability}),claim:id=>call('claim',{id}),mark:(id,state,providerId)=>call('mark',{id,state,providerId})
 };
}
