// This endpoint can access only dedicated pre-release tables. It never queries
// or mutates public.leads, public.spaces, or any Travis table.
const tables={leads:'pipeline_offer_preview_leads',versions:'pipeline_offer_preview_versions',requests:'pipeline_offer_preview_requests'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const text=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max;
export function createPreviewGateway({env,fetchImpl=fetch,cryptoImpl=crypto}={}){
 const url=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default,publicKey=env('SUPABASE_ANON_KEY')||JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;
 async function db(path,{body,method='GET',jwt,admin=true,prefer}={}){
  const key=admin?secret:publicKey;
  const response=await fetchImpl(url+path,{method,headers:{apikey:key,...(jwt?{Authorization:'Bearer '+jwt}:key?.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),...(body?{'Content-Type':'application/json'}:{}),...(prefer?{Prefer:prefer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok){const error=new Error('Test kayıt servisi işlemi tamamlayamadı.');error.status=response.status;throw error;}
  return response.status===204?null:response.json();
 }
 async function user(jwt){
  if(!text(jwt,5000))throw Error('Test oturumu gerekli.');
  const value=await db('/auth/v1/user',{admin:false,jwt});
  if(value?.app_metadata?.pipeline_offer_preview!==true||!uuid.test(value.id))throw Error('Bu servis yalnızca ayrı test oturumlarını kabul eder.');
  return value;
 }
 async function fixture(jwt){
  const who=await user(jwt),rows=await db('/rest/v1/'+tables.leads+'?owner_id=eq.'+who.id+'&select=*&order=created_at.asc&limit=1',{admin:false,jwt});
  const lead=rows?.[0];if(!lead)throw Error('Test kartı bulunamadı.');
  const latest=await db('/rest/v1/'+tables.versions+'?lead_id=eq.'+encodeURIComponent(lead.id)+'&select=id,version,state,monthly_amount&order=version.desc&limit=1',{admin:false,jwt});
  return {user:{id:who.id},rows:{spaces:[{id:lead.space_id,name:'Teklif Test Alanı',color:'#378ADD',created_at:Date.now()}],columns:[{id:lead.col_id,space_id:lead.space_id,title:'Teklif Aşamasında',dot:'#BA7517'}],leads:[lead]},latest:latest?.[0]||null};
 }
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(req.method!=='POST')return reply({error:'POST gerekli.'},405);
  try{
   const key=req.headers.get('x-offer-store-key');if(!/^[A-Za-z0-9_-]{43}$/.test(key||''))return reply({error:'Yetki gerekli.'},401);
   const keyHash=Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const configured=await db('/rest/v1/pipeline_offer_preview_gateway_config?select=key_hash&id=eq.true&limit=1');
   if(configured?.[0]?.key_hash!==keyHash)return reply({error:'Yetki doğrulanamadı.'},403);
   if(Number(req.headers.get('content-length'))>4200000)throw Error('Test girdisi çok büyük.');
   const raw=await req.text();if(raw.length>4200000)throw Error('Test girdisi çok büyük.');
   const body=JSON.parse(raw),{action}=body;
   if(action==='health')return reply({ready:true,mode:'isolated-preview',productionDataAccess:false});
   if(action==='bootstrap'){
    const id=cryptoImpl.randomUUID(),password=cryptoImpl.randomUUID()+cryptoImpl.randomUUID();
    const email='offer-preview-'+id+'@example.invalid';
    const created=await db('/auth/v1/admin/users',{method:'POST',body:{email,password,email_confirm:true,app_metadata:{pipeline_offer_preview:true},user_metadata:{name:'Teklif Testi'}}});
    const owner=created.id||created.user?.id;if(!uuid.test(owner))throw Error('Test oturumu oluşturulamadı.');
    await db('/rest/v1/'+tables.leads,{method:'POST',body:{owner_id:owner,contacts:[{name:'Örnek Yetkili',email:'yetkili@example.invalid',role:'Test'}],last_contact:Date.now()}});
    const session=await db('/auth/v1/token?grant_type=password',{method:'POST',admin:false,body:{email,password}});
    if(!session.access_token||!session.refresh_token)throw Error('Test oturumu açılamadı.');
    return reply({accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000,fixture:await fixture(session.access_token)});
   }
   if(action==='refresh'){
    if(!text(body.refreshToken,5000))throw Error('Test oturumu geçersiz.');
    const session=await db('/auth/v1/token?grant_type=refresh_token',{method:'POST',admin:false,body:{refresh_token:body.refreshToken}});
    await user(session.access_token);
    return reply({accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000});
   }
   if(action==='fixture')return reply(await fixture(body.jwt));
   if(['save','list','publish','outbox'].includes(action)){
    const who=await user(body.jwt),jwt=body.jwt;
    if(action==='save'){
     if(!text(body.args?.p_lead_id)||!text(body.args?.p_space_id)||!text(body.args?.p_request_id,80))throw Error('Test kartı bilgileri geçersiz.');
     return reply(await db('/rest/v1/rpc/save_pipeline_offer_preview',{method:'POST',admin:false,jwt,body:body.args}));
    }
    if(action==='list'){
     if(!text(body.leadId))throw Error('Test kartı geçersiz.');
     return reply(await db('/rest/v1/'+tables.versions+'?select=id,version,state,monthly_amount,created_at,customer_document,operator_link_envelope&lead_id=eq.'+encodeURIComponent(body.leadId)+'&order=version.desc&limit=1',{admin:false,jwt}));
    }
    if(action==='outbox')return reply(await db('/rest/v1/'+tables.requests+'?select=id,offer_id,alternative_id,requester_name,requester_email,monthly_amount,delivery_state,provider_id,created_at&order=created_at.desc&limit=30',{admin:false,jwt}));
    if(!uuid.test(body.id)||!/^[a-f0-9]{64}$/.test(body.tokenHash)||!/^[a-f0-9]{64}$/.test(body.passwordHash)||!text(body.operatorLinkEnvelope,5000))throw Error('Test bağlantısı geçersiz.');
    return reply(await db('/rest/v1/'+tables.versions+'?id=eq.'+body.id+'&owner_id=eq.'+who.id+'&select=id,version',{method:'PATCH',admin:false,jwt,prefer:'return=representation',body:{state:'published',public_token_hash:body.tokenHash,password_hash:body.passwordHash,operator_link_envelope:body.operatorLinkEnvelope}}));
   }
   if(action==='access'){
    if(!/^[a-f0-9]{64}$/.test(body.tokenHash)||!/^[a-f0-9]{64}$/.test(body.passwordHash))throw Error('Test müşteri bağlantısı geçersiz.');
    const rows=await db('/rest/v1/'+tables.versions+'?select=id,version,customer_document&state=eq.published&public_token_hash=eq.'+body.tokenHash+'&password_hash=eq.'+body.passwordHash+'&limit=1');
    if(rows?.length!==1)throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');
    return reply(rows[0]);
   }
   if(action==='queue'){
    const input=body.input;if(!uuid.test(body.offerId)||!uuid.test(input?.requestId)||!text(input?.name,160)||!text(input?.email,254)||!['growth_operations','operations_bundle'].includes(input?.alternativeId))throw Error('Test talebi geçersiz.');
    // An authenticated customer capability must accompany every queue operation.
    if(!/^[a-f0-9]{64}$/.test(body.tokenHash)||!/^[a-f0-9]{64}$/.test(body.passwordHash))throw Error('Müşteri doğrulaması gerekli.');
    const offers=await db('/rest/v1/'+tables.versions+'?select=id,customer_document&state=eq.published&id=eq.'+body.offerId+'&public_token_hash=eq.'+body.tokenHash+'&password_hash=eq.'+body.passwordHash);
    const a=offers?.[0]?.customer_document.alternatives.find(a=>a.id===input.alternativeId);if(!a)throw Error('Yayınlanmış test teklifi gerekli.');
    const count=await db('/rest/v1/'+tables.requests+'?offer_id=eq.'+body.offerId+'&select=id&limit=21');if(count.length>=20&&!count.some(r=>r.id===input.requestId))throw Error('Bu test teklifinin talep sınırına ulaşıldı.');
    await db('/rest/v1/'+tables.requests+'?on_conflict=id',{method:'POST',prefer:'resolution=ignore-duplicates',body:{id:input.requestId,offer_id:body.offerId,alternative_id:input.alternativeId,requester_name:input.name,requester_email:input.email,monthly_amount:a.monthlyAmount,mail_payload:body.payload}});
    const rows=await db('/rest/v1/'+tables.requests+'?id=eq.'+input.requestId+'&offer_id=eq.'+body.offerId+'&select=*');
    const row=rows?.[0];if(!row||row.alternative_id!==input.alternativeId||row.requester_name!==input.name||row.requester_email!==input.email)throw Error('Test talebi değişmiş.');return reply(row);
   }
   if(['claim','mark'].includes(action)){
    if(!uuid.test(body.id))throw Error('Test talebi geçersiz.');
    if(action==='claim')return reply((await db('/rest/v1/'+tables.requests+'?id=eq.'+body.id+'&delivery_state=eq.pending&select=id',{method:'PATCH',prefer:'return=representation',body:{delivery_state:'sending',claimed_at:new Date().toISOString()}}))?.length===1);
    if(!['accepted','uncertain'].includes(body.state)||body.providerId!==undefined&&!text(body.providerId,200))throw Error('Test bildirim durumu geçersiz.');
    await db('/rest/v1/'+tables.requests+'?id=eq.'+body.id,{method:'PATCH',body:{delivery_state:body.state,...(body.providerId?{provider_id:body.providerId}:{})}});return reply({ok:true});
   }
   throw Error('Test işlemi geçersiz.');
  }catch(error){return reply({error:error.message||'Test kayıt servisi tamamlanamadı.'},422);}
 };
}
