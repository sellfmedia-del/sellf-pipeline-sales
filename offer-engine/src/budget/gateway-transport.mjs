import {BudgetError,tariff} from './ledger.mjs';
import {providerSchema} from '../bhs/schema.mjs';
const origin='https://ai-gateway.vercel.sh/v1';
const metadata=value=>value.providerMetadata?.gateway||value.provider_metadata?.gateway;
export function gatewayRequest(model,body,schema){
 const messages=[];
 if(body.systemInstruction)messages.push({role:'system',content:body.systemInstruction.parts.map(p=>p.text||'').join('\n')});
 for(const content of body.contents||[])messages.push({role:content.role==='model'?'assistant':'user',content:content.parts.map(p=>p.inlineData?{type:'image_url',image_url:{url:'data:'+p.inlineData.mimeType+';base64,'+p.inlineData.data}}:{type:'text',text:p.text||''})});
 return {model:'google/'+model,messages,stream:false,max_tokens:body.generationConfig.maxOutputTokens,reasoning:{effort:body.generationConfig.thinkingConfig.thinkingLevel.toLowerCase()},response_format:{type:'json_schema',json_schema:{name:'offer_stage',strict:false,schema:providerSchema(schema,{arrayBounds:false})}},providerOptions:{gateway:{only:['vertex']}}};
}
export function createGatewayTransport({token,fetchImpl=fetch}={}){
 const readyModels=new Map();let credit;
 const headers=()=>({Authorization:'Bearer '+token});
 async function json(url,options={}){
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(15000),redirect:'error',...options});const raw=await r.text();
  if(raw.length>2000000)throw new BudgetError('provider_size','AI servis yanıtı sınırı aştı.');
  let data;try{data=JSON.parse(raw);}catch{throw new BudgetError('provider_format','AI servis yanıtı okunamadı.');}
  return {r,data};
 }
 async function ready(model){
  if(!token)throw new BudgetError('not_configured','Yedek AI erişimi henüz etkin değil.');
  if(!tariff.models[model])throw new BudgetError('model_budget','Onaylı model gerekli.');
  if(!credit)credit=(async()=>{
   const {r,data}=await json(origin+'/credits',{headers:headers()});
   if(!r.ok||!Number.isFinite(Number(data.balance))||Number(data.balance)<=0)throw new BudgetError('not_configured','Yedek AI hesabının erişimi veya bakiyesi doğrulanamadı.');
  })();
  await credit;
  if(!readyModels.has(model))readyModels.set(model,(async()=>{
   const {r,data}=await json(origin+'/models/google/'+encodeURIComponent(model)+'/endpoints');
   const endpoint=data.data?.endpoints?.find(e=>e.provider_name==='vertex'),rate=tariff.models[model],price=endpoint?.pricing;
   if(!r.ok||!price||!Number.isFinite(Number(price.prompt))||!Number.isFinite(Number(price.completion))||Number(price.prompt)*1e6>rate.input+1e-9||Number(price.completion)*1e6>rate.output+1e-9||Number(price.request)!==0)throw new BudgetError('tariff_expired','Yedek modelin güncel fiyatı maliyet sınırıyla doğrulanamadı.');
  })());
  await readyModels.get(model);
 }
 return {ready,async generate(model,body,schema,timeout){
  await ready(model);
  let result;
  try{result=await json(origin+'/chat/completions',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify(gatewayRequest(model,body,schema)),signal:AbortSignal.timeout(timeout)});}
  catch(error){if(error.name==='TimeoutError'||error instanceof TypeError){const failure=new BudgetError(error.name==='TimeoutError'?'model_timeout':'model_network','Yedek AI bağlantısı tamamlanamadı; ayrılmış maliyet korundu.');failure.providerOperation='generateContent';throw failure;}throw error;}
  const {r,data}=result,gateway=metadata(data),routing=gateway?.routing;
  if(!r.ok){
   const noAttempt=routing?.totalProviderAttemptCount===0&&['no_providers_available','authentication_error','insufficient_funds','quota_for_entity_exceeded'].includes(data.error?.type||data.error?.code);
   const error=new BudgetError(noAttempt?'not_configured':r.status===429?'quota':'provider_error',noAttempt?'Yedek AI model erişimi etkin değil; yeni model tüketimi oluşmadı.':'Yedek AI isteği tamamlanamadı.');
   error.providerStatus=r.status;error.providerOperation='generateContent';error.definitelyNotBilled=noAttempt;throw error;
  }
  if(routing?.resolvedProvider!=='vertex'||!['google/'+model,model].includes(data.model)||routing?.originalModelId&&routing.originalModelId!=='google/'+model)throw new BudgetError('provider_accounting','Yedek AI modeli veya servis yolu doğrulanamadı.');
  const usage=data.usage||{},reasoning=usage.completion_tokens_details?.reasoning_tokens||0;
  for(const value of [usage.prompt_tokens,usage.completion_tokens,usage.total_tokens,reasoning])if(!Number.isSafeInteger(value)||value<0)throw new BudgetError('provider_accounting','Yedek AI kullanım kaydı geçersiz.');
  if(reasoning>usage.completion_tokens||usage.total_tokens!==usage.prompt_tokens+usage.completion_tokens)throw new BudgetError('provider_accounting','Yedek AI token toplamı uyuşmuyor.');
  const choice=data.choices?.[0],text=typeof choice?.message?.content==='string'?choice.message.content:(choice?.message?.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('');
  return {candidates:[{finishReason:choice?.finish_reason==='stop'?'STOP':choice?.finish_reason==='length'?'MAX_TOKENS':'OTHER',content:{parts:[{text}]}}],usageMetadata:{promptTokenCount:usage.prompt_tokens,candidatesTokenCount:usage.completion_tokens-reasoning,thoughtsTokenCount:reasoning,totalTokenCount:usage.total_tokens,cachedContentTokenCount:usage.prompt_tokens_details?.cached_tokens||0},gatewayReceipt:{generationId:data.id||gateway?.generationId,provider:'vertex',model:'google/'+model}};
 }};
}
