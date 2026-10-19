import {reportSchema} from './schema.mjs';
import {researchPrompt,extractionPrompt} from './prompts.mjs';
const endpoint='https://generativelanguage.googleapis.com/v1beta/interactions';
const agents=['deep-research-preview-04-2026','deep-research-max-preview-04-2026'];
export class ResearchError extends Error{constructor(code,message){super(message);this.code=code;}}
export function interactionId(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,512}$/.test(id))throw new ResearchError('invalid_job','Araştırma kimliği geçersiz.');return id;}
export function modelText(interaction){
  const last=(interaction.steps||[]).filter(x=>x.type==='model_output').at(-1);
  return (last?.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('\n');
}
export function citationUrls(interaction){
  const urls=new Set();
  for(const step of interaction.steps||[])if(step.type==='model_output')for(const part of step.content||[])if(part.type==='text')for(const a of part.annotations||[])if(a.type==='url_citation'&&typeof a.url==='string')urls.add(a.url);
  return [...urls];
}
export function createResearchProvider({apiKey=process.env.OFFER_GEMINI_API_KEY,agent=process.env.OFFER_BHS_AGENT||agents[1],model=process.env.OFFER_BHS_EXTRACT_MODEL||'gemini-4-argon',fetchImpl=fetch}={}){
  function configured(){return Boolean(apiKey?.trim())&&agents.includes(agent)&&/^gemini-[a-z0-9.-]+$/.test(model);}
  async function request(path,body){
    if(!configured())throw new ResearchError('not_configured','BHS araştırma bağlantısı henüz tanımlı değil.');
    let response;
    try{response=await fetchImpl(endpoint+path,{method:body?'POST':'GET',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw new ResearchError('provider_unavailable','Araştırma servisine ulaşılamadı. Yeni araştırma otomatik başlatılmadı.');}
    if(!response.ok){
      // Classify errors without exposing provider text, request context or keys.
      let reason='request_rejected';
      try{
        const message=String((await response.json())?.error?.message||'');
        for(const [name,pattern]of [['invalid_key',/API key not valid|API_KEY_INVALID/i],['billing_required',/billing|paid tier|free tier/i],['model_unavailable',/not found|not supported|unknown model/i],['permission_denied',/permission|access denied/i],['quota',/quota|rate limit/i],['invalid_request',/unknown name|unknown field|invalid argument/i]])if(pattern.test(message)){reason=name;break;}
      }catch{/* Keep the safe generic classification. */}
      const error=new ResearchError(response.status===429?'quota':'provider_error',response.status===429?'Araştırma servisinin kullanım sınırına ulaşıldı.':'Araştırma servisi isteği tamamlayamadı.');
      error.providerStatus=response.status;error.providerReason=reason;throw error;
    }
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>4*1024*1024)throw new ResearchError('provider_size','Araştırma yanıtı boyut sınırını aştı.');
    let value;try{value=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw new ResearchError('provider_format','Araştırma yanıtı okunamadı.');}
    interactionId(value.id);return value;
  }
  return Object.freeze({configured,agent,model,
    start(brief,asOf){return request('',{agent,input:researchPrompt(brief,asOf),background:true,store:true,agent_config:{type:'deep-research',visualization:'off'},tools:[{type:'google_search'},{type:'url_context'}]});},
    poll(id){return request('/'+interactionId(id)+'?include_input=false');},
    structure(brief,researchId){return request('',{model,previous_interaction_id:interactionId(researchId),input:extractionPrompt(brief),background:true,store:true,response_format:{type:'text',mime_type:'application/json',schema:reportSchema}});},
    cancel(id){return request('/'+interactionId(id)+'/cancel',{});}
  });
}
