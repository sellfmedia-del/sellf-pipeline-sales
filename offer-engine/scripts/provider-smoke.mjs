// Explicit public-fixture diagnostics only; never invoked by the normal build.
import {writeFile,mkdir} from 'node:fs/promises';
if(process.env.VERCEL_ENV!=='preview'||process.argv[2]!=='--run')throw Error('Explicit preview-only diagnostic required.');
const key=process.env.OFFER_GEMINI_API_KEY;
if(!key)throw Error('Provider configuration missing.');
const redact=text=>String(text).replaceAll(key,'[credential]').replace(/AIza[A-Za-z0-9_-]+/g,'[credential]').slice(0,2500);
const results=[];
for(const format of [false,true]){
 const payload={model:process.env.OFFER_BHS_EXTRACT_MODEL||'gemini-4-argon',input:format?'Return a JSON object whose ok field is true.':'Reply with the single word OK.',...(format?{response_format:{type:'text',mime_type:'application/json',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']}}}:{})};
 try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000),redirect:'error'});
  const body=await response.json();
  results.push({format:format?'json':'text',httpStatus:response.status,status:body.status||null,error:body.error?{code:body.error.code,message:redact(body.error.message)}:null});
 }catch{results.push({format:format?'json':'text',status:'request_failed'});}
}
await mkdir('public',{recursive:true});await writeFile('public/bhs-smoke.json',JSON.stringify({test:'public-minimal-provider',results}));
console.log('BHS_SMOKE '+JSON.stringify(results.map(({format,httpStatus,status})=>({format,httpStatus,status}))));
