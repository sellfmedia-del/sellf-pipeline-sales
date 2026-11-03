import {randomUUID} from 'node:crypto';

// Only fixed metadata is logged. Never serialize errors, payloads or headers.
export function startLogoDiagnostic({stage,model,operation},{clock=Date.now,logger=console,schedule=setTimeout,cancel=clearTimeout}={}){
 const started=clock(),id=randomUUID();let status=null,finished=false;
 const meta={event:'logo_provider_diagnostic',id,stage:['logo-region','logo-backdrop'].includes(stage)?stage:'unknown',model:/^gemini-[a-z0-9.-]{1,60}$/.test(model)?model:'unknown',operation:['countTokens','generateContent'].includes(operation)?operation:'unknown'};
 const emit=(level,phase,extra={})=>{try{logger[level](JSON.stringify({...meta,phase,elapsedMs:Math.max(0,clock()-started),status,...extra}));}catch{/* Diagnostics cannot affect the request. */}};
 emit('info','start');
 const timer=schedule(()=>emit('warn','still_waiting'),60000);timer?.unref?.();
 return {
  response(value){status=Number.isInteger(value)&&value>=100&&value<=599?value:null;emit('info','response');},
  finish(error){
   if(finished)return;finished=true;cancel(timer);
   if(!error){emit('info','complete');return;}
   const transport=['TimeoutError','AbortError'].includes(error.name)?'timeout':error instanceof TypeError?'network':null;
   // failureReason returns fixed categories; unknown values are never copied.
   const reasons=['context_limit','invalid_key','billing_required','schema_rejected','model_unavailable','permission_denied','quota','invalid_request','request_rejected'];
   const codes=['quota','provider_error','provider_size','provider_format'];
   emit('error','failed',{code:codes.includes(error.code)?error.code:transport||'request_failed',reason:reasons.includes(error.providerReason)?error.providerReason:'unclassified'});
  }
 };
}
