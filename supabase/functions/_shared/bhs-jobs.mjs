// BHS-only extension, called AFTER the existing gateway credential check.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=/^[a-f0-9]{64}$/;
export function createBhsGatewayActions({mode,env,db,user,validateLead,cryptoImpl=globalThis.crypto}){
 return async body=>{
  const op=body.action.slice('bhs_job_'.length),worker=['claim','budget','advance','pause'].includes(op);
  let owner=null;
  if(worker){
   if(!/^[A-Za-z0-9_-]{43}$/.test(body.workerSecret||''))throw Error('BHS worker unavailable.');
   const secret=env('BHS_WORKER_SECRET');
   if(secret){
    if(!/^[A-Za-z0-9_-]{43}$/.test(secret))throw Error('BHS worker unavailable.');
    const digest=async value=>new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(value)));
    const [a,b]=await Promise.all([digest(secret),digest(body.workerSecret)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)throw Error('BHS worker authorization failed.');
   }else if(await db('/rest/v1/rpc/pipeline_bhs_worker_authorized',{method:'POST',body:{p_secret:body.workerSecret}})!==true)throw Error('BHS worker authorization failed.');
  }else{
   if(!['find','enqueue','read','cancel'].includes(op))throw Error('Invalid BHS operation.');
   const who=await user(body.jwt);owner=who.id;
   if(typeof body.leadId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(body.leadId))throw Error('Invalid BHS lead.');
   await validateLead(body.leadId,owner);
  }
  if(['read','cancel','budget','advance','pause'].includes(op)&&!uuid.test(body.jobId))throw Error('Invalid BHS job.');
  if(worker&&op!=='claim'&&!uuid.test(body.leaseToken)||op==='claim'&&!uuid.test(body.leaseToken))throw Error('Invalid BHS lease.');
  let data={};
  if(op==='find'){if(!hash.test(body.briefHash))throw Error('Invalid BHS brief.');data={briefHash:body.briefHash};}
  if(op==='enqueue'){
   const {briefText,briefHash,budgetId,spec}=body;
   if(!hash.test(briefHash)||!uuid.test(budgetId)||typeof briefText!=='string'||briefText.length>90000||!spec||spec.researchVersion!=='v8'||spec.researchModel!=='claude-sonnet-5-5')throw Error('Invalid BHS input.');
   const brief=JSON.parse(briefText),fields=['brandName','segment','website','goals','needs','services','meetingNotes','budget'];
   if(Object.keys(brief).length!==fields.length||Object.keys(brief).some(k=>!fields.includes(k))||spec.researchRunId!==undefined&&!uuid.test(spec.researchRunId)||spec.sourceOfferId!==undefined&&!uuid.test(spec.sourceOfferId))throw Error('Invalid BHS specification.');
   // Do not persist a JWT, refresh token or arbitrary caller fields.
   data={briefText,briefHash,budgetId,spec:{researchVersion:'v8',researchModel:'claude-sonnet-5-5',...(spec.researchRunId?{researchRunId:spec.researchRunId}:{}),...(spec.sourceOfferId?{sourceOfferId:spec.sourceOfferId}:{})}};
  }
  if(op==='budget'){
   const value=body.data||{};
   if(!['status','get','reserve','complete','uncertain'].includes(value.op)||value.step!==undefined&&!/^[A-Za-z0-9:_-]{1,160}$/.test(value.step)||value.hash!==undefined&&!hash.test(value.hash)||value.token!==undefined&&!uuid.test(value.token)||value.amount!==undefined&&(!Number.isSafeInteger(value.amount)||value.amount<0||value.amount>4500))throw Error('Invalid BHS receipt.');data=value;
  }
  if(op==='advance')data={nextPhase:body.nextPhase,checkpointKey:body.checkpointKey};
  if(op==='pause')data={code:/^[a-z0-9_]{1,80}$/.test(body.code||'')?body.code:'worker_unavailable'};
  return db('/rest/v1/rpc/pipeline_bhs_job_op',{method:'POST',body:{p_mode:mode,p_op:op,p_owner:owner,p_lead:worker?null:body.leadId,p_id:body.jobId||null,p_token:body.leaseToken||null,p_data:data}});
 };
}
