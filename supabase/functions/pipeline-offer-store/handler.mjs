// Production-only offer storage. Existing CRM ownership is checked explicitly.
// No bootstrap, bulk save/delete, Auth modification, or Travis operations.
const tables={leads:'leads',versions:'pipeline_offer_versions',requests:'pipeline_offer_requests'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validSlug=v=>typeof v==='string'&&v.length<=120&&/^[a-z0-9]+(?:-[a-z0-9]+)*-teklifi(?:-v\d+-[a-f0-9]{8})?$/.test(v);
const text=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max;
export function createProductionGateway({env,fetchImpl=fetch,cryptoImpl=crypto}={}){
 const url=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default,publicKey=env('SUPABASE_ANON_KEY')||JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;
 async function db(path,{body,method='GET',jwt,admin=true,prefer}={}){
  const key=admin?secret:publicKey;
  const response=await fetchImpl(url+path,{method,headers:{apikey:key,...(jwt?{Authorization:'Bearer '+jwt}:key?.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),...(body?{'Content-Type':'application/json'}:{}),...(prefer?{Prefer:prefer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok){const error=new Error('Teklif kayıt servisi işlemi tamamlayamadı.');error.status=response.status;try{const detail=await response.json();if(/^[A-Z0-9_]{1,30}$/.test(detail.code||''))error.code='database_'+detail.code;const reasons=['step input changed','budget not found','preview lead required','reservation ownership mismatch','invalid settled usage','step result too large'];if(reasons.includes(detail.message))error.code=detail.message.replaceAll(' ','_');}catch{}throw error;}
  const raw=await response.text();return raw.trim()?JSON.parse(raw):null;
 }
 async function user(jwt){
  if(!text(jwt,5000))throw Error('Test oturumu gerekli.');
  const value=await db('/auth/v1/user',{admin:false,jwt});
  if(value?.is_anonymous===true||value?.app_metadata?.pipeline_offer_preview===true||!uuid.test(value?.id))throw Error('Geçerli Pipeline oturumu gerekli.');
  return value;
 }
 async function ownedLead(owner,id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('Kart bilgisi geçersiz.');
  const leads=await db('/rest/v1/leads?id=eq.'+encodeURIComponent(id)+'&select=id,space_id&limit=1');
  const lead=leads?.[0];if(!lead)throw Error('Kart yetkisi doğrulanamadı.');
  const spaces=await db('/rest/v1/spaces?id=eq.'+encodeURIComponent(lead.space_id)+'&user_id=eq.'+owner+'&select=id&limit=1');
  if(spaces?.length!==1)throw Error('Kart yetkisi doğrulanamadı.');return lead;
 }
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(req.method!=='POST')return reply({error:'POST gerekli.'},405);
  try{
   const key=req.headers.get('x-offer-store-key');if(!/^[A-Za-z0-9_-]{43}$/.test(key||''))return reply({error:'Yetki gerekli.'},401);
   const keyHash=Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const configured=await db('/rest/v1/pipeline_offer_gateway_config?select=key_hash&id=eq.true&limit=1');
   if(![configured?.[0]?.key_hash].includes(keyHash))return reply({error:'Yetki doğrulanamadı.'},403);
   if(Number(req.headers.get('content-length'))>4200000)throw Error('Test girdisi çok büyük.');
   const raw=await req.text();if(raw.length>4200000)throw Error('Test girdisi çok büyük.');
   const body=JSON.parse(raw),{action}=body;
   if(action==='health')return reply({ready:true,mode:'pipeline-production'});
   if(action==='authorize'){
    const who=await user(body.jwt);if(body.leadId)await ownedLead(who.id,body.leadId);
    return reply({ownerId:who.id});
   }
   if(action==='budget'){
    const who=await user(body.jwt);await ownedLead(who.id,body.leadId);
    if(!['begin','status','get','reserve','complete','uncertain'].includes(body.op)||!text(body.leadId,100)||
       body.step!==undefined&&!/^[A-Za-z0-9:_-]{1,160}$/.test(body.step)||
       body.hash!==undefined&&!/^[a-f0-9]{64}$/.test(body.hash)||
       body.token!==undefined&&!uuid.test(body.token)||
       body.amount!==undefined&&(!Number.isSafeInteger(body.amount)||body.amount<0||body.amount>4500))throw Error('Maliyet kaydı geçersiz.');
    return reply(await db('/rest/v1/rpc/pipeline_offer_production_budget_op',{method:'POST',body:{p_owner:who.id,p_lead:body.leadId,p_op:body.op,p_step:body.step||null,p_hash:body.hash||null,p_amount:body.amount||0,p_token:body.token||null,p_value:body.value??null}}));
   }
   if(['save','list','publish','publication','outbox'].includes(action)){
    const who=await user(body.jwt),jwt=body.jwt;
    if(action==='save'){
     if(!text(body.args?.p_lead_id)||!text(body.args?.p_space_id)||!text(body.args?.p_request_id,80))throw Error('Test kartı bilgileri geçersiz.');
     await ownedLead(who.id,body.args.p_lead_id);
     return reply(await db('/rest/v1/rpc/save_pipeline_offer_production',{method:'POST',body:{...body.args,p_owner:who.id}}));
    }
    if(action==='list'){
     await ownedLead(who.id,body.leadId);
     return reply(await db('/rest/v1/'+tables.versions+'?select=id,version,state,monthly_amount,created_at,customer_document,operator_link_envelope&owner_id=eq.'+who.id+'&lead_id=eq.'+encodeURIComponent(body.leadId)+'&order=version.desc&limit=1',{}));
    }
    if(action==='outbox')throw Error('Bu işlem canlı teklif servisinde kapalı.');
    if(!uuid.test(body.id))throw Error('Test teklifi geçersiz.');
    const rows=await db('/rest/v1/'+tables.versions+'?id=eq.'+body.id+'&owner_id=eq.'+who.id+'&select=id,lead_id,version,state,customer_document,operator_link_envelope',{});
    const row=rows?.[0];if(!row)throw Error('Teklif bulunamadı.');await ownedLead(who.id,row.lead_id);
    if(action==='publication')return reply(row);
    if(!/^[a-f0-9]{64}$/.test(body.tokenHash)||!/^[a-f0-9]{64}$/.test(body.passwordHash)||!text(body.operatorLinkEnvelope,5000)||body.slug!==undefined&&!validSlug(body.slug))throw Error('Test bağlantısı geçersiz.');
    if(body.slug===undefined)return reply(await db('/rest/v1/'+tables.versions+'?id=eq.'+body.id+'&owner_id=eq.'+who.id+'&select=id,version',{method:'PATCH',prefer:'return=representation',body:{state:'published',public_token_hash:body.tokenHash,password_hash:body.passwordHash,operator_link_envelope:body.operatorLinkEnvelope}}));
    const collision=await db('/rest/v1/'+tables.versions+'?select=id&state=eq.published&customer_document->publication->>slug=eq.'+body.slug+'&id=neq.'+row.id+'&limit=1');
    if(collision?.length)return reply({error:'Marka bağlantısı kullanımda.',code:'slug_unavailable'},422);
    const compare=body.expectedEnvelope?'eq.'+encodeURIComponent(body.expectedEnvelope):'is.null';
    return reply(await db('/rest/v1/'+tables.versions+'?id=eq.'+body.id+'&owner_id=eq.'+who.id+'&operator_link_envelope='+compare+'&select=id,version',{method:'PATCH',prefer:'return=representation',body:{state:'published',public_token_hash:body.tokenHash,password_hash:body.passwordHash,operator_link_envelope:body.operatorLinkEnvelope,customer_document:{...row.customer_document,publication:{slug:body.slug}}}}));
   }
   if(action==='resolve_slug'){
    if(!validSlug(body.slug))throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');
    const rows=await db('/rest/v1/'+tables.versions+'?select=id,operator_link_envelope&state=eq.published&customer_document->publication->>slug=eq.'+body.slug+'&limit=1');
    if(rows?.length!==1)throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');return reply(rows[0]);
   }
   if(action==='access'){
    if(!/^[a-f0-9]{64}$/.test(body.tokenHash)||!/^[a-f0-9]{64}$/.test(body.passwordHash))throw Error('Test müşteri bağlantısı geçersiz.');
    const rows=await db('/rest/v1/'+tables.versions+'?select=id,version,customer_document&state=eq.published&public_token_hash=eq.'+body.tokenHash+'&password_hash=eq.'+body.passwordHash+'&limit=1');
    if(rows?.length!==1)throw Error('Teklif bağlantısı veya şifresi doğrulanamadı.');
    return reply(rows[0]);
   }
   throw Error('Test işlemi geçersiz.');
  }catch(error){return reply({error:error.message||'Teklif kayıt servisi tamamlanamadı.',code:error.code||'offer_gateway'},422);}
 };
}
