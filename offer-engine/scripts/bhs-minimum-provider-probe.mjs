const key=process.env.ANTHROPIC_API_KEY;
const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_PROJECT_ID!=='prj_B6Q6FIgq9NjbBlb6ga03cn6PD3jJ'||process.env.VERCEL_GIT_COMMIT_REF!=='qa/bhs-claude-humm-20261114')throw new Error('Isolated preview required');
const known={
 accountDisabled:/(?:organization|account|workspace).{0,45}(?:disabled|suspend|deactivat|restrict|inactive|blocked)/i,
 orgSpend:/(?:spend|spending|cost|budget|quota)|monthly (?:limit|usage)|usage limit/i,
 workspaceHeader:/anthropic-workspace-id|not scoped to a workspace|select a workspace/i,
 organization:/organi[sz]ation/i, account:/account/i, workspace:/workspace/i, limit:/limit/i,
 verification:/verif/i, activation:/activat|enabled|disabled|suspend/i,
 allowed:/allow|authoriz|permission|denied|cannot/i, reach:/reach|exceed/i,
 credits:/credit|fund|balance|billing|payment/i,
 customerVerification:/customer_verification_required|valid payment method/i,
 insufficientGateway:/insufficient_funds|quota_for_entity_exceeded/i
};
const directModel='claude-sonnet-5-5',gatewayModel='anthropic/claude-sonnet-5.5';
const cases=[
 {id:'direct',url:'https://api.anthropic.com/v1/messages/count_tokens',credential:key,headers:{'x-api-key':key},model:directModel},
 {id:'gateway',url:'https://ai-gateway.vercel.sh/v1/messages',credential:token,headers:{authorization:'Bearer '+token},model:gatewayModel,max_tokens:64}
];
await Promise.all(cases.map(async({id,url,credential,headers,model,max_tokens})=>{
 if(!credential){console.info(JSON.stringify({event:'bhs_provider_minimum_detail',id,credential:false}));return}
 try{
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2026-10-21',...headers},body:JSON.stringify({model,messages:[{role:'user',content:'Respond with exactly OK.'}],...(max_tokens?{max_tokens}:{})}),signal:AbortSignal.timeout(20000),redirect:'error'});
  const result=await response.json(),error=result.error||{};
  const msg=typeof error.message==='string'?error.message:'';
  const matching=Object.entries(known).filter(([,pattern])=>pattern.test(msg+' '+(error.type||'')+' '+(error.code||''))).map(([name])=>name);
  const req=result.request_id||response.headers.get('request-id');
  // Only structured operational flags and support identifiers leave this probe.
  console.info(JSON.stringify({event:'bhs_provider_minimum_detail',id,status:response.status,type:/^[a-z_]{1,60}$/.test(error.type||'')?error.type:undefined,matching,requestId:/^req_[A-Za-z0-9]{12,80}$/.test(req||'')?req:undefined,validModel:response.ok?['claude-sonnet-5-5',gatewayModel].includes(result.model):undefined,returnedText:response.ok?result.content?.some(c=>c.type==='text'):undefined,
   accepted:response.ok,companyText:false}));
 }catch(error){console.info(JSON.stringify({event:'bhs_provider_minimum_detail',id,transport:['TimeoutError','SyntaxError'].includes(error.name)?error.name:'fetch_error'}));}
}));
