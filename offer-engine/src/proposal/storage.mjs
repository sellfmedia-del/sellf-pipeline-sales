import {createHash,createHmac,randomBytes} from 'node:crypto';
export const tokenHash=s=>createHash('sha256').update(s).digest('hex');
export const passwordHash=(secret,token,password)=>{if(typeof secret!=='string'||secret.length<32)throw Error('Müşteri bağlantısı doğrulama anahtarı gerekli.');return createHmac('sha256',secret).update('sellf-portal-v1\n'+token+'\n'+password).digest('hex');};
export function createOfferStore({url=process.env.OFFER_SUPABASE_URL,key=process.env.OFFER_SUPABASE_ANON_KEY,serviceKey=process.env.OFFER_SUPABASE_SERVICE_ROLE_KEY,enabled=process.env.OFFER_PERSISTENCE_ENABLED==='true',fetchImpl=fetch}={}){
 async function request(path,{token,body,method='GET',service=false,prefer}={}){
  if(!enabled||!url||!key||service&&!serviceKey)throw Error('Teklif kayıt bağlantısı henüz etkin değil.');
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url))throw Error('Kayıt sunucusu geçersiz.');
  const credential=service?serviceKey:key;
  const response=await fetchImpl(url+path,{method,headers:{apikey:credential,Authorization:'Bearer '+(service?serviceKey:token||key),...(body?{'Content-Type':'application/json'}:{}),...(prefer?{Prefer:prefer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw Error('Teklif kaydı tamamlanamadı. Yetki veya veritabanı bağlantısını kontrol et.');
  const raw=await response.text();return raw.trim()?JSON.parse(raw):null;
 }
 return {configured:()=>enabled&&Boolean(url&&key),portalConfigured:()=>enabled&&Boolean(url&&key&&serviceKey),
  async save(token,body){
   const user=await request('/auth/v1/user',{token});if(!user?.id)throw Error('Pipeline oturumu gerekli.');
   return request('/rest/v1/rpc/save_pipeline_offer',{method:'POST',token,body});
  },
  async list(token,leadId){return request('/rest/v1/pipeline_offer_versions?select=id,version,state,monthly_amount,created_at,customer_document&lead_id=eq.'+encodeURIComponent(leadId)+'&order=version.desc&limit=1',{token});},
  async publish(token,id,secret){
   const publicToken=randomBytes(32).toString('base64url'),password=randomBytes(12).toString('base64url');
   const rows=await request('/rest/v1/pipeline_offer_versions?id=eq.'+encodeURIComponent(id)+'&select=id,version',{method:'PATCH',token,body:{state:'published',public_token_hash:tokenHash(publicToken),password_hash:passwordHash(secret,publicToken,password)},prefer:'return=representation'});
   if(rows?.length!==1)throw Error('Teklif yayınlama yetkisi doğrulanamadı.');
   return {id,version:rows[0].version,token:publicToken,password};
  },
  async access(token,password,secret){
   if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||typeof password!=='string'||password.length>128)throw Error('Teklif bağlantısı veya şifresi geçersiz.');
   const rows=await request('/rest/v1/pipeline_offer_versions?select=id,version,customer_document&state=eq.published&public_token_hash=eq.'+tokenHash(token)+'&password_hash=eq.'+passwordHash(secret,token,password)+'&limit=1',{service:true});
   if(rows?.length!==1)throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');
   return rows[0];
  },
  async queue(offer,input,payload){
   // Stored immutable body + provider idempotency key makes retries consistent.
   await request('/rest/v1/pipeline_offer_requests?on_conflict=id',{method:'POST',service:true,prefer:'resolution=ignore-duplicates',body:{id:input.requestId,offer_id:offer.id,alternative_id:input.alternativeId,requester_name:input.name,requester_email:input.email,monthly_amount:input.monthlyAmount,mail_payload:payload}});
   const rows=await request('/rest/v1/pipeline_offer_requests?id=eq.'+input.requestId+'&offer_id=eq.'+offer.id+'&select=*',{service:true});
   const row=rows?.[0];if(!row||row.alternative_id!==input.alternativeId||row.requester_name!==input.name||row.requester_email!==input.email)throw Error('Sözleşme talebi kaydı değişmiş.');return row;
  },
  async claim(id){
   const rows=await request('/rest/v1/pipeline_offer_requests?id=eq.'+id+'&delivery_state=eq.pending&select=id',{method:'PATCH',service:true,prefer:'return=representation',body:{delivery_state:'sending',claimed_at:new Date().toISOString()}});
   return rows?.length===1;
  },
  mark(id,state,providerId){return request('/rest/v1/pipeline_offer_requests?id=eq.'+id,{method:'PATCH',service:true,body:{delivery_state:state,...(providerId?{provider_id:providerId}:{})}});}
 };
}
